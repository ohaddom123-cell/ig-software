import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  date,
  time,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const approvalStatusEnum = pgEnum("approval_status", [
  "draft",
  "approved",
  "rejected",
  "posted",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "sent",
  "failed",
]);

export const timeTrackingKindEnum = pgEnum("time_tracking_kind", [
  "baseline",
  "pilot",
]);

/**
 * Brand guidelines are merged directly onto `clients` rather than a separate
 * 1:1 table — it's a pure extension of the client record, and a join buys
 * nothing here (see the engineering-standards note on avoiding unnecessary
 * abstractions).
 */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").default(""),
  industry: text("industry").default(""),
  audience: text("audience").default(""),
  timezone: text("timezone").notNull().default("Asia/Jerusalem"),
  active: boolean("active").notNull().default(true),

  // Brand guidelines
  tone: text("tone").default(""),
  writingStyle: text("writing_style").default(""),
  preferredTerms: text("preferred_terms").default(""),
  prohibitedTerms: text("prohibited_terms").default(""),
  contentRestrictions: text("content_restrictions").default(""),
  ctaGuidelines: text("cta_guidelines").default(""),
  productsServices: text("products_services").default(""),
  additionalNotes: text("additional_notes").default(""),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postingSchedules = pgTable(
  "posting_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 32 }).notNull().default("instagram"),
    // 0 = Sunday ... 6 = Saturday, matches JS Date#getDay()
    weekday: integer("weekday").notNull(),
    postingTime: time("posting_time").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("posting_schedules_client_idx").on(t.clientId)],
);

export const historicalPosts = pgTable(
  "historical_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 32 }).notNull().default("instagram"),
    caption: text("caption").notNull(),
    publishedAt: date("published_at"),
    category: text("category").default(""),
    notes: text("notes").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("historical_posts_client_idx").on(t.clientId)],
);

/**
 * One brief per client per week. The unique constraint is what makes
 * re-submitting the same week idempotent instead of silently duplicating
 * the whole calendar — see lib/generation/generateWeeklyCalendar.ts.
 */
export const weeklyBriefs = pgTable(
  "weekly_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    rawIdeas: text("raw_ideas").notNull().default(""),
    promotions: text("promotions").default(""),
    events: text("events").default(""),
    additionalInstructions: text("additional_instructions").default(""),
    isHistoricalReplay: boolean("is_historical_replay").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("weekly_briefs_client_week_unique").on(t.clientId, t.weekStart),
    index("weekly_briefs_client_idx").on(t.clientId),
  ],
);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => weeklyBriefs.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 32 }).notNull().default("instagram"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),

    contentConcept: text("content_concept").notNull(),
    draftCaption: text("draft_caption").notNull(),
    currentCaption: text("current_caption").notNull(),
    cta: text("cta").default(""),
    sourceReference: text("source_reference").default(""),

    needsClarification: boolean("needs_clarification").notNull().default(false),
    clarificationNote: text("clarification_note").default(""),

    approvalStatus: approvalStatusEnum("approval_status").notNull().default("draft"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // Bumped every time currentCaption changes after approval; lets a reminder
    // double check it's still sending the version the manager actually approved.
    approvedVersion: integer("approved_version").notNull().default(0),
    version: integer("version").notNull().default(1),

    // Set when the owning brief is a historical replay, so the reminder
    // scanner can exclude it even if a bug ever let one through.
    isHistoricalReplay: boolean("is_historical_replay").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("content_items_client_idx").on(t.clientId),
    index("content_items_brief_idx").on(t.briefId),
    index("content_items_scheduled_idx").on(t.scheduledAt),
    index("content_items_status_idx").on(t.approvalStatus),
  ],
);

export const reminderDeliveries = pgTable(
  "reminder_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    approvedVersion: integer("approved_version").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    deliveryStatus: deliveryStatusEnum("delivery_status").notNull().default("pending"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The actual idempotency guarantee: at most one delivery row per
    // (content item, approved version). A second cron tick that finds this
    // row already exists simply skips — see cron/reminders/route.ts.
    uniqueIndex("reminder_deliveries_item_version_unique").on(
      t.contentItemId,
      t.approvedVersion,
    ),
    index("reminder_deliveries_status_idx").on(t.deliveryStatus),
  ],
);

export const timeTrackingEntries = pgTable(
  "time_tracking_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    kind: timeTrackingKindEnum("kind").notNull(),
    planningMinutes: integer("planning_minutes").notNull().default(0),
    writingMinutes: integer("writing_minutes").notNull().default(0),
    notes: text("notes").default(""),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("time_tracking_client_idx").on(t.clientId)],
);

// --- relations (for ergonomic query().with() usage) ---

export const clientsRelations = relations(clients, ({ many }) => ({
  schedules: many(postingSchedules),
  historicalPosts: many(historicalPosts),
  briefs: many(weeklyBriefs),
  contentItems: many(contentItems),
  timeTracking: many(timeTrackingEntries),
}));

export const postingSchedulesRelations = relations(postingSchedules, ({ one }) => ({
  client: one(clients, { fields: [postingSchedules.clientId], references: [clients.id] }),
}));

export const weeklyBriefsRelations = relations(weeklyBriefs, ({ one, many }) => ({
  client: one(clients, { fields: [weeklyBriefs.clientId], references: [clients.id] }),
  contentItems: many(contentItems),
}));

export const contentItemsRelations = relations(contentItems, ({ one, many }) => ({
  client: one(clients, { fields: [contentItems.clientId], references: [clients.id] }),
  brief: one(weeklyBriefs, { fields: [contentItems.briefId], references: [weeklyBriefs.id] }),
  reminders: many(reminderDeliveries),
}));

export const reminderDeliveriesRelations = relations(reminderDeliveries, ({ one }) => ({
  contentItem: one(contentItems, {
    fields: [reminderDeliveries.contentItemId],
    references: [contentItems.id],
  }),
}));
