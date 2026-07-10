/** A normalized PayDirt time entry — the output of the PayDirt client. */
export interface PaydirtEntry {
  /** PayDirt's entry id (string form). */
  id: string;
  /** PayDirt project name (resolved from the job's project_id). */
  projectName: string;
  /** PayDirt job name — the "task" in the day view. */
  taskName: string;
  /** Raw start instant from PayDirt (UTC). Zoned to the config tz downstream. */
  start: string;
  durationSeconds: number;
  notes: string;
}

/** Where a PayDirt project+task maps to in Keito. */
export interface KeitoTarget {
  /** Keito client the project sits under; disambiguates the client-grouped
   *  project picker. Blank when unknown (e.g. passthrough). */
  client: string;
  /** Keito project — also the term typed into the project search. */
  project: string;
  projectId: string;
  /** Keito task — also the term typed into the task search. */
  task: string;
  taskId: string;
}

/** How a target was resolved: an explicit override, or name passthrough. */
export type MatchVia = 'override' | 'passthrough';

/** One mapped output record — one per PayDirt entry. */
export interface MappedEntry {
  paydirt: { id: string; project: string; task: string; notes: string };
  keito: KeitoTarget;
  /** Whether keito came from a mapping.json override or name passthrough. */
  via: MatchVia;
  start: string;
  /** start + durationSeconds, same offset as start. */
  end: string;
  durationSeconds: number;
}

/** A PayDirt entry with no mapping — surfaced, never silently dropped. */
export interface UnmappedEntry {
  id: string;
  project: string;
  task: string;
  durationSeconds: number;
  notes: string;
}

/** The full day feed future Keito paths consume. */
export interface DayOutput {
  date: string;
  entries: MappedEntry[];
  unmapped: UnmappedEntry[];
}
