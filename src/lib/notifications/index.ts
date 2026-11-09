import type { NotificationProvider } from "./provider";
import { DryRunProvider } from "./dryrun";
import { EmailProvider } from "./email";

export type { NotificationProvider, ReminderPayload, SendResult } from "./provider";

/**
 * Provider swap point. Adding WhatsApp later means implementing
 * NotificationProvider in a new file and adding one case here — nothing
 * in the scheduling/cron logic needs to change.
 */
export function getNotificationProvider(): NotificationProvider {
  const kind = process.env.NOTIFICATION_PROVIDER ?? "dryrun";
  switch (kind) {
    case "email":
      return new EmailProvider();
    case "dryrun":
      return new DryRunProvider();
    default:
      throw new Error(
        `Unknown NOTIFICATION_PROVIDER "${kind}". Supported in v1: "email", "dryrun".`,
      );
  }
}
