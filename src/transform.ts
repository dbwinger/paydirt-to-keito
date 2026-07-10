import { resolveMatch, type Mapping } from './mapping.js';
import { zonedRange } from './time.js';
import type { DayOutput, MappedEntry, PaydirtEntry, UnmappedEntry } from './types.js';

/**
 * Build the day feed from normalized PayDirt entries and the mapping.
 *
 * Pure: one output record per input entry. Mapped entries get start/end
 * rendered in `timeZone` with `end = start + duration`, and are tagged with how
 * they resolved (`via`). With `passthrough` on (default), a pair not found in
 * the mapping carries its PayDirt names through; with it off (strict), such a
 * pair is collected as unmapped so nothing is silently assumed.
 */
export function buildDay(
  date: string,
  entries: PaydirtEntry[],
  mapping: Mapping,
  timeZone: string,
  options: { passthrough?: boolean } = {},
): DayOutput {
  const passthrough = options.passthrough ?? true;
  const mapped: MappedEntry[] = [];
  const unmapped: UnmappedEntry[] = [];

  for (const entry of entries) {
    const match = resolveMatch(mapping, entry.projectName, entry.taskName, { passthrough });

    if (!match) {
      unmapped.push({
        id: entry.id,
        project: entry.projectName,
        task: entry.taskName,
        durationSeconds: entry.durationSeconds,
        notes: entry.notes,
      });
      continue;
    }

    const { start, end } = zonedRange(entry.start, entry.durationSeconds, timeZone);

    mapped.push({
      paydirt: {
        id: entry.id,
        project: entry.projectName,
        task: entry.taskName,
        notes: entry.notes,
      },
      keito: match.target,
      via: match.via,
      start,
      end,
      durationSeconds: entry.durationSeconds,
    });
  }

  return { date, entries: mapped, unmapped };
}
