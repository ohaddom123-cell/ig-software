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
  jsonb,
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
  description: text("description").notNull().default(""),
  industry: text("industry").notNull().default(""),
  audience: text("audience").notNull().default(""),
  timezone: text("timezone").notNull().default("Asia/Jerusalem"),
  active: boolean("active").notNull().default(true),

  // Brand guidelines
  tone: text("tone").notNull().default(""),
  writingStyle: text("writing_style").notNull().default(""),
  preferredTerms: text("preferred_terms").notNull().default(""),
  prohibitedTerms: text("prohibited_terms").notNull().default(""),
  contentRestrictions: text("content_restrictions").notNull().default(""),
  ctaGuidelines: text("cta_guidelines").notNull().default(""),
  productsServices: text("products_services").notNull().default(""),
  additionalNotes: text("additional_notes").notNull().default(""),

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
    category: text("category").notNull().default(""),
    notes: text("notes").notNull().default(""),
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
    promotions: text("promotions").notNull().default(""),
    events: text("events").notNull().default(""),
    additionalInstructions: text("additional_instructions").notNull().default(""),
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
    cta: text("cta").notNull().default(""),
    sourceReference: text("source_reference").notNull().default(""),

    needsClarification: boolean("needs_clarification").notNull().default(false),
    clarificationNote: text("clarification_note").notNull().default(""),

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
    notes: text("notes").notNull().default(""),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("time_tracking_client_idx").on(t.clientId)],
);

export const reelStatusEnum = pgEnum("reel_status", [
  "uploaded",
  "processing",
  "ready_for_review",
  "approved",
  "rejected",
  "failed",
]);

/**
 * Raw footage in, captioned Reel out. Deliberately a separate table from
 * contentItems rather than a shared "content" shape — the two have almost
 * no fields in common (a caption's unit of work is text; a reel's is a
 * multi-step render pipeline with its own failure modes), so sharing a
 * table would mean a pile of nullable columns that only apply to one kind.
 */
export const reelItems = pgTable(
  "reel_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    rawFootageUrl: text("raw_footage_url").notNull(),
    status: reelStatusEnum("status").notNull().default("uploaded"),
    errorMessage: text("error_message").notNull().default(""),

    // Non-silent segments computed from the raw footage, in source-timeline
    // milliseconds: [{ startMs, endMs }, ...]. Null until processing runs.
    keepSegments: jsonb("keep_segments").$type<{ startMs: number; endMs: number }[]>(),

    // Word-level captions (the Caption[] shape from @remotion/captions),
    // already remapped onto the TRIMMED (post-cut) timeline so they line
    // up with keepSegments as rendered, not the raw source.
    captions: jsonb("captions").$type<
      {
        text: string;
        startMs: number;
        endMs: number;
        timestampMs: number | null;
        confidence: number | null;
      }[]
    >(),

    renderedVideoUrl: text("rendered_video_url"),

    // "approved"/"rejected" live on `status` above, alongside the pipeline
    // states — one state field, not two overlapping ones. approvedAt is
    // just the audit timestamp for when that transition happened.
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reel_items_client_idx").on(t.clientId),
    index("reel_items_status_idx").on(t.status),
  ],
);

// --- relations (for ergonomic query().with() usage) ---

export const clientsRelations = relations(clients, ({ many }) => ({
  schedules: many(postingSchedules),
  historicalPosts: many(historicalPosts),
  briefs: many(weeklyBriefs),
  contentItems: many(contentItems),
  timeTracking: many(timeTrackingEntries),
  reelItems: many(reelItems),
}));

export const reelItemsRelations = relations(reelItems, ({ one }) => ({
  client: one(clients, { fields: [reelItems.clientId], references: [clients.id] }),
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
