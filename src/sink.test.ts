import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { JsonSink } from './sink.js';
import type { DayOutput } from './types.js';

const day: DayOutput = {
  date: '2026-07-09',
  entries: [
    {
      paydirt: { id: '321', project: 'Acme Website Redesign', task: 'Frontend', notes: 'nav' },
      keito: { client: 'Acme Co', project: 'Website Redesign', projectId: 'p1', task: 'UI', taskId: 't9' },
      via: 'override',
      start: '2026-07-09T09:00:00-06:00',
      end: '2026-07-09T10:30:00-06:00',
      durationSeconds: 5400,
    },
  ],
  unmapped: [],
};

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('JsonSink', () => {
  it('writes pretty-printed JSON to the given file path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'p2k-'));
    dirs.push(dir);
    const out = join(dir, 'day.json');

    await new JsonSink(out).write(day);

    const written = await readFile(out, 'utf8');
    expect(JSON.parse(written)).toEqual(day);
    expect(written).toContain('\n  "date": "2026-07-09"');
  });
});
