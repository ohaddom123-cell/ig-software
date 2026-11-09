import { db } from "@/db/client";
import { clients, postingSchedules } from "@/db/schema";

export async function createTestClient(overrides: Partial<typeof clients.$inferInsert> = {}) {
  const [client] = await db
    .insert(clients)
    .values({
      name: "Test Client",
      timezone: "Asia/Jerusalem",
      ...overrides,
    })
    .returning();
  if (!client) throw new Error("Failed to create test client");
  return client;
}

export async function addSchedule(
  clientId: string,
  rule: { weekday: number; postingTime: string; platform?: string },
) {
  const [row] = await db
    .insert(postingSchedules)
    .values({
      clientId,
      weekday: rule.weekday,
      postingTime: rule.postingTime,
      platform: rule.platform ?? "instagram",
    })
    .returning();
  return row;
}
