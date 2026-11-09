import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function zodError(error: ZodError) {
  return jsonError(
    error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
    422,
  );
}
