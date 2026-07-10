import type { MappedEntry, DayOutput } from '../types.js';
import type { TimeEntrySink } from '../sink.js';
import { formatDuration, toClockTime } from './clock.js';
import { addEntry, goToDay, type ResolvedEntry } from './form.js';
import { ensureSession, openSession } from './session.js';
import { addPushed, hasPushed, loadPushed, savePushed } from './state.js';

export interface KeitoBrowserSinkOptions {
  /** Saved Playwright session (storageState). */
  authPath: string;
  /** Dedup state file. */
  statePath: string;
  /** Run the browser visibly. */
  headed?: boolean;
  /** Resolve and print the plan without launching a browser. */
  dryRun?: boolean;
  /** If no valid session, open a browser to sign in before pushing. */
  autoLogin?: boolean;
}

/** Turn a mapped feed entry into the concrete values Keito's form needs. */
function resolve(entry: MappedEntry): ResolvedEntry {
  return {
    client: entry.keito.client,
    project: entry.keito.project,
    task: entry.keito.task,
    notes: entry.paydirt.notes,
    startClock: toClockTime(entry.start),
    endClock: toClockTime(entry.end),
    expectedDuration: formatDuration(entry.durationSeconds),
  };
}

function describe(r: ResolvedEntry): string {
  const notes = r.notes ? ` — "${r.notes}"` : '';
  return `${r.project} / ${r.task}  ${r.startClock}–${r.endClock} (${r.expectedDuration})${notes}`;
}

/**
 * Drives Keito's web form (via Playwright) to create each mapped entry.
 *
 * Expects the feed built in strict mode, so `day.entries` are all explicitly
 * mapped; `day.unmapped` pairs are reported and skipped (no Keito target).
 * Already-pushed entries (tracked per date) are skipped so re-runs never
 * double-enter. Push-all: a failed entry is reported and the run continues;
 * only successes are recorded.
 */
export class KeitoBrowserSink implements TimeEntrySink {
  constructor(private readonly opts: KeitoBrowserSinkOptions) {}

  async write(day: DayOutput): Promise<void> {
    let pushed = await loadPushed(this.opts.statePath);

    for (const u of day.unmapped) {
      process.stderr.write(`skip (unmapped): ${u.project} / ${u.task}\n`);
    }

    const todo: { id: string; resolved: ResolvedEntry }[] = [];
    for (const entry of day.entries) {
      const resolved = resolve(entry);
      if (hasPushed(pushed, day.date, entry.paydirt.id)) {
        process.stderr.write(`skip (already pushed): ${describe(resolved)}\n`);
      } else {
        todo.push({ id: entry.paydirt.id, resolved });
      }
    }

    if (this.opts.dryRun) {
      process.stdout.write(`Plan for ${day.date} — ${todo.length} entr${todo.length === 1 ? 'y' : 'ies'} to push:\n`);
      for (const t of todo) process.stdout.write(`  ${describe(t.resolved)}\n`);
      return;
    }

    if (todo.length === 0) {
      process.stderr.write(`Nothing to push for ${day.date}.\n`);
      return;
    }

    const open = this.opts.autoLogin ? ensureSession : openSession;
    const session = await open({ authPath: this.opts.authPath, headed: this.opts.headed });
    const failures: string[] = [];
    try {
      await goToDay(session.page, day.date);
      for (const t of todo) {
        try {
          await addEntry(session.page, t.resolved);
          pushed = addPushed(pushed, day.date, t.id);
          await savePushed(this.opts.statePath, pushed);
          process.stderr.write(`pushed: ${describe(t.resolved)}\n`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failures.push(`${describe(t.resolved)}: ${message}`);
          process.stderr.write(`FAILED: ${describe(t.resolved)}: ${message}\n`);
        }
      }
    } finally {
      await session.close();
    }

    if (failures.length > 0) {
      process.stderr.write(
        `\n${failures.length} entr${failures.length === 1 ? 'y' : 'ies'} failed. ` +
          `Re-run to retry — successes are recorded and skipped.\n`,
      );
      process.exitCode = 1;
    }
  }
}
