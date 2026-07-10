import { describe, expect, it } from 'vitest';
import {
  buildJobUrl,
  buildProjectUrl,
  buildTimeUrl,
  deriveStartDuration,
  extractArray,
  extractObject,
  fetchTimeEntries,
  normalizeTimeLog,
} from './paydirt.js';
import type { Config } from './config.js';

const config: Config = {
  apiKey: 'secret',
  clientId: '17',
  timeZone: 'America/Denver',
  baseUrl: 'https://app.paydirtapp.com/api/v1',
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('url builders', () => {
  it('buildTimeUrl scopes to /time with api_key, client_id, and the date range', () => {
    const url = new URL(buildTimeUrl(config, { start: '2026-07-09', end: '2026-07-09' }));
    expect(url.pathname).toBe('/api/v1/time');
    expect(url.searchParams.get('api_key')).toBe('secret');
    expect(url.searchParams.get('client_id')).toBe('17');
    expect(url.searchParams.get('start')).toBe('2026-07-09');
    expect(url.searchParams.get('end')).toBe('2026-07-09');
  });

  it('buildJobUrl and buildProjectUrl target the right path with api_key', () => {
    expect(new URL(buildJobUrl(config, '264')).pathname).toBe('/api/v1/jobs/264');
    expect(new URL(buildProjectUrl(config, '10')).pathname).toBe('/api/v1/projects/10');
    expect(new URL(buildJobUrl(config, '264')).searchParams.get('api_key')).toBe('secret');
  });
});

describe('extractArray', () => {
  it('unwraps a { time_logs: [...] } envelope', () => {
    expect(extractArray({ time_logs: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });

  it('accepts a bare array', () => {
    expect(extractArray([{ id: 1 }])).toEqual([{ id: 1 }]);
  });

  it('falls back to the first array-valued property', () => {
    expect(extractArray({ time: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });

  it('throws a helpful error pointing at --raw on an unrecognized shape', () => {
    expect(() => extractArray({ nope: true })).toThrow(/--raw/);
  });
});

describe('extractObject', () => {
  it('unwraps a { job: {...} } envelope', () => {
    expect(extractObject({ job: { id: 1 } }, 'job')).toEqual({ id: 1 });
  });

  it('passes through when the wrapper key is absent', () => {
    expect(extractObject({ id: 1 }, 'job')).toEqual({ id: 1 });
  });
});

describe('normalizeTimeLog', () => {
  it('maps the raw time_log fields, stringifying ids', () => {
    const raw = {
      id: 321,
      job_id: 264,
      duration_only: false,
      date: null,
      started_at: '2026-07-09T15:30:00.000Z',
      ended_at: '2026-07-09T17:00:00.000Z',
      duration: null,
      description: 'Working on website design',
    };
    expect(normalizeTimeLog(raw)).toEqual({
      id: '321',
      jobId: '264',
      durationOnly: false,
      date: null,
      startedAt: '2026-07-09T15:30:00.000Z',
      endedAt: '2026-07-09T17:00:00.000Z',
      duration: null,
      description: 'Working on website design',
    });
  });

  it('defaults a missing description to an empty string', () => {
    const raw = { id: 1, job_id: 2, started_at: '2026-07-09T15:30:00.000Z', ended_at: '2026-07-09T16:00:00.000Z' };
    expect(normalizeTimeLog(raw).description).toBe('');
  });
});

describe('deriveStartDuration', () => {
  it('derives duration from start/end when duration is null', () => {
    const log = normalizeTimeLog({
      id: 1,
      job_id: 2,
      started_at: '2026-07-09T15:30:00.000Z',
      ended_at: '2026-07-09T17:00:00.000Z',
      duration: null,
    });
    expect(deriveStartDuration(log)).toEqual({
      start: '2026-07-09T15:30:00.000Z',
      durationSeconds: 5400,
    });
  });

  it('uses the explicit duration and a date-based start for duration-only entries', () => {
    const log = normalizeTimeLog({
      id: 1,
      job_id: 2,
      duration_only: true,
      date: '2026-07-09',
      started_at: null,
      ended_at: null,
      duration: 1800,
    });
    expect(deriveStartDuration(log)).toEqual({
      start: '2026-07-09T00:00:00.000Z',
      durationSeconds: 1800,
    });
  });
});

describe('fetchTimeEntries', () => {
  const jobs: Record<string, unknown> = {
    '264': { id: 264, client_id: 17, project_id: 10, name: 'Frontend' },
    '265': { id: 265, client_id: 17, project_id: 10, name: 'Bug Fixes' },
  };
  const projects: Record<string, unknown> = {
    '10': { id: 10, client_id: 17, name: 'Acme Website Redesign' },
  };
  const timeList = {
    time_logs: [
      {
        id: 321,
        job_id: 264,
        duration_only: false,
        started_at: '2026-07-09T15:30:00.000Z',
        ended_at: '2026-07-09T17:00:00.000Z',
        duration: null,
        description: 'Working on website design',
      },
      {
        id: 322,
        job_id: 265,
        duration_only: true,
        date: '2026-07-09',
        started_at: null,
        ended_at: null,
        duration: 1800,
        description: 'Quick bug fix',
      },
    ],
  };

  function routingFetch(calls: string[] = []) {
    return async (input: string | URL): Promise<Response> => {
      const url = new URL(input.toString());
      calls.push(url.pathname);
      if (url.pathname.endsWith('/time')) return json(timeList);
      const jobMatch = url.pathname.match(/\/jobs\/(\d+)$/);
      if (jobMatch) return json({ job: jobs[jobMatch[1]!] });
      const projMatch = url.pathname.match(/\/projects\/(\d+)$/);
      if (projMatch) return json({ project: projects[projMatch[1]!] });
      return new Response('not found', { status: 404 });
    };
  }

  it('fetches the day, resolving job -> name and project -> name', async () => {
    const entries = await fetchTimeEntries(config, '2026-07-09', routingFetch());
    expect(entries).toEqual([
      {
        id: '321',
        projectName: 'Acme Website Redesign',
        taskName: 'Frontend',
        start: '2026-07-09T15:30:00.000Z',
        durationSeconds: 5400,
        notes: 'Working on website design',
      },
      {
        id: '322',
        projectName: 'Acme Website Redesign',
        taskName: 'Bug Fixes',
        start: '2026-07-09T00:00:00.000Z',
        durationSeconds: 1800,
        notes: 'Quick bug fix',
      },
    ]);
  });

  it('caches project lookups shared across entries', async () => {
    const calls: string[] = [];
    await fetchTimeEntries(config, '2026-07-09', routingFetch(calls));
    expect(calls.filter((p) => p === '/api/v1/projects/10')).toHaveLength(1);
  });

  it('throws with the status code on a non-2xx response', async () => {
    const failing = async () => new Response('unauthorized', { status: 401 });
    await expect(fetchTimeEntries(config, '2026-07-09', failing)).rejects.toThrow(/401/);
  });
});
