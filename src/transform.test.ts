import { describe, expect, it } from 'vitest';
import { loadMapping } from './mapping.js';
import { buildDay } from './transform.js';
import type { PaydirtEntry } from './types.js';

const TZ = 'America/Denver';

const mapping = loadMapping({
  'Acme Website Redesign': {
    Frontend: {
      keitoProject: 'Website Redesign',
      keitoProjectId: 'proj_1',
      keitoTask: 'UI Development',
      keitoTaskId: 'task_9',
    },
  },
});

function entry(overrides: Partial<PaydirtEntry> = {}): PaydirtEntry {
  return {
    id: '101',
    projectName: 'Acme Website Redesign',
    taskName: 'Frontend',
    // raw UTC instant from PayDirt; 15:00Z == 09:00 in Denver (MDT, -06:00)
    start: '2026-07-09T15:00:00.000Z',
    durationSeconds: 5400,
    notes: 'built the nav',
    ...overrides,
  };
}

describe('buildDay', () => {
  it('maps an override entry, zoning start/end and tagging via=override', () => {
    const day = buildDay('2026-07-09', [entry()], mapping, TZ);

    expect(day.unmapped).toEqual([]);
    expect(day.entries).toEqual([
      {
        paydirt: {
          id: '101',
          project: 'Acme Website Redesign',
          task: 'Frontend',
          notes: 'built the nav',
        },
        keito: {
          client: '',
          project: 'Website Redesign',
          projectId: 'proj_1',
          task: 'UI Development',
          taskId: 'task_9',
        },
        via: 'override',
        start: '2026-07-09T09:00:00-06:00',
        end: '2026-07-09T10:30:00-06:00',
        durationSeconds: 5400,
      },
    ]);
  });

  it('passes an unmapped pair through by default, tagging via=passthrough', () => {
    const day = buildDay(
      '2026-07-09',
      [entry({ id: '202', projectName: 'Acme Support', taskName: '  Bug  Fixes ' })],
      mapping,
      TZ,
    );

    expect(day.unmapped).toEqual([]);
    expect(day.entries[0]?.via).toBe('passthrough');
    expect(day.entries[0]?.keito).toEqual({
      client: '',
      project: 'Acme Support',
      projectId: '',
      task: 'Bug Fixes',
      taskId: '',
    });
  });

  it('routes unmapped entries aside in strict mode (passthrough off)', () => {
    const day = buildDay(
      '2026-07-09',
      [entry({ id: '202', taskName: 'Backend' })],
      mapping,
      TZ,
      { passthrough: false },
    );

    expect(day.entries).toEqual([]);
    expect(day.unmapped).toEqual([
      {
        id: '202',
        project: 'Acme Website Redesign',
        task: 'Backend',
        durationSeconds: 5400,
        notes: 'built the nav',
      },
    ]);
  });

  it('returns empty lists for a day with no entries', () => {
    expect(buildDay('2026-07-09', [], mapping, TZ)).toEqual({
      date: '2026-07-09',
      entries: [],
      unmapped: [],
    });
  });
});
