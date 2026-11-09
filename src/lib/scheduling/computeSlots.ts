import { addDays, startOfDay } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

export interface ScheduleRule {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  postingTime: string; // "HH:mm" or "HH:mm:ss"
  platform: string;
}

export interface ComputedSlot {
  platform: string;
  scheduledAt: Date; // UTC instant
}

/**
 * Turns a client's posting schedule into concrete UTC datetimes for one
 * specific week, respecting the client's timezone (including DST — the
 * zoned -> UTC conversion is done per-slot, on that slot's actual calendar
 * date, so a DST transition inside the week is handled correctly instead of
 * applying one offset to the whole week).
 *
 * weekStart is an ISO date string (YYYY-MM-DD) understood as the Sunday
 * that starts the week, interpreted in the client's own timezone.
 */
export function computeSlotsForWeek(
  weekStart: string,
  rules: ScheduleRule[],
  timezone: string,
): ComputedSlot[] {
  if (rules.length === 0) {
    return [];
  }

  const [year, month, day] = weekStart.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid weekStart date: ${weekStart}`);
  }
  // A naive local date representing midnight of weekStart, interpreted in
  // the client's own timezone, not the server's.
  const weekStartUtcMidnight = new Date(Date.UTC(year, month - 1, day));

  const slots: ComputedSlot[] = [];

  for (const rule of rules) {
    const dayOffset = (rule.weekday - weekStartUtcMidnight.getUTCDay() + 7) % 7;
    const targetDate = addDays(startOfDay(weekStartUtcMidnight), dayOffset);

    const [hh = "0", mm = "0", ss = "0"] = rule.postingTime.split(":");
    const zonedDateString = `${targetDate.getUTCFullYear()}-${pad(
      targetDate.getUTCMonth() + 1,
    )}-${pad(targetDate.getUTCDate())}T${pad(Number(hh))}:${pad(Number(mm))}:${pad(
      Number(ss),
    )}`;

    // Interpret that wall-clock time *in the client's timezone* and convert
    // to the correct UTC instant — this is the step that makes DST correct.
    const scheduledAt = fromZonedTime(zonedDateString, timezone);

    slots.push({ platform: rule.platform, scheduledAt });
  }

  return slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
