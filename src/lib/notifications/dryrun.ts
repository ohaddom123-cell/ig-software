import type { NotificationProvider, ReminderPayload, SendResult } from "./provider";
import { renderReminderBody, renderReminderSubject } from "./provider";

/**
 * Safe default for local dev and for testing the approval -> reminder
 * pipeline before any real notification credentials exist. Never fails,
 * never actually sends anything — just logs what WOULD have been sent.
 */
export class DryRunProvider implements NotificationProvider {
  readonly name = "dryrun";

  async send(payload: ReminderPayload): Promise<SendResult> {
    console.log(
      `[dryrun notification]\nSubject: ${renderReminderSubject(payload)}\n${renderReminderBody(payload)}\n`,
    );
    return { success: true };
  }
}
