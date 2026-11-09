import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contentItems } from "@/db/schema";

export class ApprovalError extends Error {}

/**
 * The single place that mutates approval state, deliberately kept out of
 * the route handler so Phase 9's tests can exercise these transitions
 * directly without going through HTTP. This — not the UI — is what the
 * spec calls "the approval gate implemented throughout the backend, not
 * just the UI."
 */
export async function approveContentItem(id: string) {
  const [existing] = await db.select().from(contentItems).where(eq(contentItems.id, id));
  if (!existing) throw new ApprovalError("Content item not found");

  const [row] = await db
    .update(contentItems)
    .set({
      approvalStatus: "approved",
      approvedAt: new Date(),
      approvedVersion: existing.version,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, id))
    .returning();
  return row;
}

export async function rejectContentItem(id: string) {
  const [row] = await db
    .update(contentItems)
    .set({ approvalStatus: "rejected", updatedAt: new Date() })
    .where(eq(contentItems.id, id))
    .returning();
  if (!row) throw new ApprovalError("Content item not found");
  return row;
}

export async function markPosted(id: string) {
  const [row] = await db
    .update(contentItems)
    .set({ approvalStatus: "posted", updatedAt: new Date() })
    .where(eq(contentItems.id, id))
    .returning();
  if (!row) throw new ApprovalError("Content item not found");
  return row;
}

/**
 * Editing the caption always bumps `version`. If the item was approved,
 * editing immediately reverts it to `draft` and clears the approval —
 * this is the "edit invalidates approval" rule, enforced here so there's
 * no code path that can save an edit without it.
 */
export async function editContentItemCaption(id: string, newCaption: string) {
  const [existing] = await db.select().from(contentItems).where(eq(contentItems.id, id));
  if (!existing) throw new ApprovalError("Content item not found");

  const wasApproved = existing.approvalStatus === "approved" || existing.approvalStatus === "posted";

  const [row] = await db
    .update(contentItems)
    .set({
      currentCaption: newCaption,
      version: existing.version + 1,
      approvalStatus: wasApproved ? "draft" : existing.approvalStatus,
      approvedAt: wasApproved ? null : existing.approvedAt,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, id))
    .returning();
  return row;
}
