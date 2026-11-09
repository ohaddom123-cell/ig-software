import { Resend } from "resend";
import type { NotificationProvider, ReminderPayload, SendResult } from "./provider";
import { renderReminderBody, renderReminderSubject } from "./provider";

export class EmailProvider implements NotificationProvider {
  readonly name = "email";
  private resend: Resend;
  private from: string;
  private to: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.REMINDER_FROM_EMAIL;
    const to = process.env.REMINDER_TO_EMAIL;
    if (!apiKey || !from || !to) {
      throw new Error(
        "Email notifications are implemented but not configured — set RESEND_API_KEY, REMINDER_FROM_EMAIL, and REMINDER_TO_EMAIL (see .env.example).",
      );
    }
    this.resend = new Resend(apiKey);
    this.from = from;
    this.to = to;
  }

  async send(payload: ReminderPayload): Promise<SendResult> {
    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to: this.to,
        subject: renderReminderSubject(payload),
        text: renderReminderBody(payload),
      });
      if (result.error) {
        return { success: false, error: result.error.message };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "unknown error" };
    }
  }
}
