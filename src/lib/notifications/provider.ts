export interface ReminderPayload {
  clientName: string;
  platform: string;
  scheduledForLocal: string; // pre-formatted, in the client's timezone
  contentConcept: string;
  approvedCaption: string;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(payload: ReminderPayload): Promise<SendResult>;
}

export function renderReminderSubject(payload: ReminderPayload): string {
  return `Time to post — ${payload.clientName}`;
}

export function renderReminderBody(payload: ReminderPayload): string {
  return [
    `It's time to publish your scheduled ${payload.platform} post.`,
    "",
    `Client: ${payload.clientName}`,
    `Platform: ${payload.platform}`,
    `Time: ${payload.scheduledForLocal}`,
    `Content concept: ${payload.contentConcept}`,
    "",
    "Approved caption:",
    payload.approvedCaption,
    "",
    `Copy the caption, open ${payload.platform}, and publish it.`,
  ].join("\n");
}
