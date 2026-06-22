// Timezone helpers. The product timezone is America/New_York (Eastern, NJ).

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  // ms that the wall-clock in `timeZone` is ahead of UTC (negative for ET).
  return asUTC - date.getTime();
}

/** UTC instant of 00:00 today in America/New_York. */
export function startOfEasternDayUTC(now = new Date()): Date {
  const offset = tzOffsetMs(now, "America/New_York");
  const etLocal = new Date(now.getTime() + offset);
  etLocal.setUTCHours(0, 0, 0, 0);
  return new Date(etLocal.getTime() - offset);
}

/** Format an ISO timestamp as "6:12 AM ET" style wall-clock in Eastern. */
export function formatEasternTime(iso: string | null): string {
  if (!iso) return "—";
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso)) + " ET"
  );
}
