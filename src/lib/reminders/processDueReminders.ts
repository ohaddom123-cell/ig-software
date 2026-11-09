import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, contentItems, reminderDeliveries } from "@/db/schema";
import { getNotificationProvider, type NotificationProvider } from "../notifications";
import { DryRunProvider } from "../notifications/dryrun";

const MAX_ATTEMPTS = 5;

export interface ProcessResult {
  due: number;
  sent: number;
  skippedAlreadySent: number;
  failed: number;
  skippedMaxAttempts: number;
}

/**
 * The approval gate's enforcement doesn't stop at lib/approval.ts — it's
 * repeated here as a hard WHERE clause (approvalStatus = 'approved') so
 * there is no code path, cron or otherwise, that can notify about
 * draft/rejected content. See tests/approval-gate.test.ts.
 */
export async function processDueReminders(now: Date = new Date()): Promise<ProcessResult> {
  const remindersLive = process.env.REMINDERS_LIVE === "true";
  const provider: NotificationProvider = remindersLive ? getNotificationProvider() : new DryRunProvider();

  const dueItems = await db
    .select({ item: contentItems, client: clients })
    .from(contentItems)
    .innerJoin(clients, eq(contentItems.clientId, clients.id))
    .where(
      and(
        eq(contentItems.approvalStatus, "approved"),
        eq(contentItems.isHistoricalReplay, false),
        lte(contentItems.scheduledAt, now),
      ),
    );

  const result: ProcessResult = { due: dueItems.length, sent: 0, skippedAlreadySent: 0, failed: 0, skippedMaxAttempts: 0 };

  for (const { item, client } of dueItems) {
    const [existingDelivery] = await db
      .select()
      .from(reminderDeliveries)
      .where(
        and(
          eq(reminderDeliveries.contentItemId, item.id),
          eq(reminderDeliveries.approvedVersion, item.approvedVersion),
        ),
      );

    if (existingDelivery?.deliveryStatus === "sent") {
      result.skippedAlreadySent++;
      continue;
    }

    if (existingDelivery && existingDelivery.attemptCount >= MAX_ATTEMPTS) {
      result.skippedMaxAttempts++;
      continue;
    }

    const deliveryId = existingDelivery
      ? existingDelivery.id
      : (
          await db
            .insert(reminderDeliveries)
            .values({
              contentItemId: item.id,
              approvedVersion: item.approvedVersion,
              scheduledFor: item.scheduledAt,
              provider: provider.name,
              deliveryStatus: "pending",
            })
            // If a concurrent cron run already inserted this exact
            // (contentItemId, approvedVersion) pair between our SELECT and
            // this INSERT, defer to it instead of erroring or double-send.
            .onConflictDoNothing({
              target: [reminderDeliveries.contentItemId, reminderDeliveries.approvedVersion],
            })
            .returning()
        )[0]?.id;

    if (!deliveryId) {
      // Lost the race to a concurrent run — it owns this delivery now.
      result.skippedAlreadySent++;
      continue;
    }

    const scheduledForLocal = new Intl.DateTimeFormat("en-GB", {
      timeZone: client.timezone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(item.scheduledAt);

    const sendResult = await provider.send({
      clientName: client.name,
      platform: item.platform,
      scheduledForLocal,
      contentConcept: item.contentConcept,
      approvedCaption: item.currentCaption,
    });

    const attemptCount = (existingDelivery?.attemptCount ?? 0) + 1;

    if (sendResult.success) {
      await db
        .update(reminderDeliveries)
        .set({ deliveryStatus: "sent", deliveredAt: new Date(), attemptCount })
        .where(eq(reminderDeliveries.id, deliveryId));
      result.sent++;
    } else {
      await db
        .update(reminderDeliveries)
        .set({ deliveryStatus: "failed", attemptCount, lastError: sendResult.error ?? "unknown error" })
        .where(eq(reminderDeliveries.id, deliveryId));
      result.failed++;
    }
  }

  return result;
}
