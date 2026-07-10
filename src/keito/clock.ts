/**
 * Keito's time inputs take a 12-hour wall-clock string like "6:13 PM".
 *
 * The feed's `start`/`end` are offset-bearing ISO strings (e.g.
 * `2026-07-09T18:13:00+02:00`) already rendered in the config timezone, so the
 * wall clock we want is the literal `HH:MM` in the string. We read it directly
 * rather than via `Date`, which would re-project into the runtime's timezone.
 */
export function toClockTime(iso: string): string {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) {
    throw new Error(`Cannot read a wall-clock time from: ${iso}`);
  }
  const hour24 = Number(match[1]);
  const minute = match[2];
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${period}`;
}

/**
 * Format a duration in seconds as Keito's `h:mm` display (e.g. 1740 → "0:29",
 * 4500 → "1:15"). Used to assert Keito derived the expected span from the
 * start/end times before the entry is saved.
 */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** The calendar date (YYYY-MM-DD) portion of an ISO string. */
export function dayFromIso(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    throw new Error(`Cannot read a date from: ${iso}`);
  }
  return iso.slice(0, 10);
}
