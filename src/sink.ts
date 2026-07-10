import { writeFile } from 'node:fs/promises';
import type { DayOutput } from './types.js';

/**
 * A destination for the mapped day feed.
 *
 * `JsonSink` (here) writes the feed as JSON. `KeitoBrowserSink`
 * (`src/keito/sink.ts`) drives Keito's web form via Playwright to create the
 * entries. Both implement this interface without touching the fetch/map core; a
 * future REST sink could too, should Keito expose an API.
 */
export interface TimeEntrySink {
  write(day: DayOutput): Promise<void>;
}

/** Writes the day feed as pretty JSON — to a file if given a path, else stdout. */
export class JsonSink implements TimeEntrySink {
  constructor(private readonly outPath?: string) {}

  async write(day: DayOutput): Promise<void> {
    const text = `${JSON.stringify(day, null, 2)}\n`;
    if (this.outPath) {
      await writeFile(this.outPath, text, 'utf8');
    } else {
      process.stdout.write(text);
    }
  }
}
