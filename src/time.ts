function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The UTC offset of `timeZone` at `instant`, formatted like `-06:00`/`+00:00`. */
function zoneOffset(instant: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(instant)
    .find((p) => p.type === 'timeZoneName')?.value;

  // longOffset yields "GMT-06:00", "GMT+05:30", or plain "GMT" at zero.
  const match = name?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return '+00:00';
  const [, sign, hours, minutes = '00'] = match;
  return `${sign}${pad(Number(hours))}:${minutes}`;
}

/** The wall-clock fields of `instant` as seen in `timeZone`. */
function wallClock(instant: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const out: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** The calendar date (YYYY-MM-DD) in `timeZone` for the given instant. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const c = wallClock(now, timeZone);
  return `${c.year}-${c.month}-${c.day}`;
}

/**
 * Render a UTC (or offset-bearing) instant as an ISO 8601 string in `timeZone`,
 * with the zone's actual offset for that instant (DST-aware).
 */
export function toZonedIso(instantIso: string, timeZone: string): string {
  const instant = new Date(instantIso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Unparseable timestamp: ${instantIso}`);
  }
  const c = wallClock(instant, timeZone);
  const offset = zoneOffset(instant, timeZone);
  return `${c.year}-${c.month}-${c.day}T${c.hour}:${c.minute}:${c.second}${offset}`;
}

/**
 * Given a start instant and a duration, return start and end (start + duration)
 * both rendered in `timeZone`. End is computed from the true instant, so a
 * duration spanning a DST change stays correct.
 */
export function zonedRange(
  startInstantIso: string,
  durationSeconds: number,
  timeZone: string,
): { start: string; end: string } {
  const startMs = new Date(startInstantIso).getTime();
  if (Number.isNaN(startMs)) {
    throw new Error(`Unparseable timestamp: ${startInstantIso}`);
  }
  const endIso = new Date(startMs + durationSeconds * 1000).toISOString();
  return {
    start: toZonedIso(startInstantIso, timeZone),
    end: toZonedIso(endIso, timeZone),
  };
}
