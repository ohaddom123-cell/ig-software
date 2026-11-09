/** Sunday-based week containing `date` (or today), as YYYY-MM-DD boundaries. */
export function weekRangeFor(dateStr?: string | null): { weekStart: string; weekEnd: string } {
  const base = dateStr ? new Date(`${dateStr}T00:00:00Z`) : new Date();
  const day = base.getUTCDay();
  const start = new Date(base);
  start.setUTCDate(base.getUTCDate() - day);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { weekStart: start.toISOString().slice(0, 10), weekEnd: end.toISOString().slice(0, 10) };
}
