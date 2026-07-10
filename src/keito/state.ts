import { readFile, writeFile } from 'node:fs/promises';

/**
 * Which PayDirt entries have already been pushed to Keito, keyed by date so the
 * same entry id can never be double-entered on a re-run. Persisted as
 * `.keito-pushed.json` (gitignored).
 */
export type PushedRecord = Record<string, string[]>;

/** Validate/normalize a parsed JSON value into a PushedRecord. */
export function parsePushed(raw: unknown): PushedRecord {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Pushed-state file must be a JSON object keyed by date.');
  }
  const out: PushedRecord = {};
  for (const [date, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(ids) || !ids.every((v) => typeof v === 'string')) {
      throw new Error(`Pushed-state entry for "${date}" must be an array of id strings.`);
    }
    out[date] = [...ids];
  }
  return out;
}

/** Whether `id` has already been pushed for `date`. */
export function hasPushed(record: PushedRecord, date: string, id: string): boolean {
  return record[date]?.includes(id) ?? false;
}

/** Return a copy of `record` with `id` marked pushed for `date` (no duplicates). */
export function addPushed(record: PushedRecord, date: string, id: string): PushedRecord {
  const existing = record[date] ?? [];
  if (existing.includes(id)) return record;
  return { ...record, [date]: [...existing, id] };
}

/** Load the pushed-state file, or an empty record if it does not exist. */
export async function loadPushed(path: string): Promise<PushedRecord> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return {};
  }
  return parsePushed(JSON.parse(text));
}

/** Persist the pushed-state record. */
export async function savePushed(path: string, record: PushedRecord): Promise<void> {
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}
