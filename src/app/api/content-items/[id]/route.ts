import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, zodError } from "@/lib/api-utils";
import { approveContentItem, ApprovalError, editContentItemCaption, markPosted, rejectContentItem } from "@/lib/approval";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("mark_posted") }),
  z.object({ action: z.literal("edit"), currentCaption: z.string().min(1) }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  try {
    let row;
    switch (parsed.data.action) {
      case "approve":
        row = await approveContentItem(id);
        break;
      case "reject":
        row = await rejectContentItem(id);
        break;
      case "mark_posted":
        row = await markPosted(id);
        break;
      case "edit":
        row = await editContentItemCaption(id, parsed.data.currentCaption);
        break;
    }
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof ApprovalError) return jsonError(err.message, 404);
    console.error("Unexpected error updating content item:", err);
    return jsonError("Unexpected server error", 500);
  }
}
