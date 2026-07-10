import type { Config } from './config.js';
import type { PaydirtEntry } from './types.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Intermediate shape of a PayDirt `time_log`, before name resolution. */
export interface RawTimeLog {
  id: string;
  jobId: string;
  startedAt: string | null;
  endedAt: string | null;
  duration: number | null;
  durationOnly: boolean;
  date: string | null;
  description: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function buildTimeUrl(config: Config, range: { start: string; end: string }): string {
  const url = new URL(`${config.baseUrl}/time`);
  url.searchParams.set('api_key', config.apiKey);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('start', range.start);
  url.searchParams.set('end', range.end);
  return url.toString();
}

export function buildJobUrl(config: Config, jobId: string): string {
  const url = new URL(`${config.baseUrl}/jobs/${jobId}`);
  url.searchParams.set('api_key', config.apiKey);
  return url.toString();
}

export function buildProjectUrl(config: Config, projectId: string): string {
  const url = new URL(`${config.baseUrl}/projects/${projectId}`);
  url.searchParams.set('api_key', config.apiKey);
  return url.toString();
}

/** Pull the entry array out of PayDirt's collection envelope (or a bare array). */
export function extractArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = asRecord(raw);
  for (const key of ['time_logs', 'time', 'entries', 'data']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) return value;
  }
  throw new Error(
    'Unrecognized PayDirt /time response shape. Run with --raw to inspect the payload.',
  );
}

/** Unwrap a single-resource envelope like `{ job: {...} }`, else pass through. */
export function extractObject(raw: unknown, key: string): unknown {
  const obj = asRecord(raw);
  return key in obj ? obj[key] : raw;
}

export function normalizeTimeLog(raw: unknown): RawTimeLog {
  const o = asRecord(raw);
  return {
    id: String(o.id),
    jobId: String(o.job_id),
    startedAt: typeof o.started_at === 'string' ? o.started_at : null,
    endedAt: typeof o.ended_at === 'string' ? o.ended_at : null,
    duration: o.duration == null ? null : Number(o.duration),
    durationOnly: Boolean(o.duration_only),
    date: typeof o.date === 'string' ? o.date : null,
    description: typeof o.description === 'string' ? o.description : '',
  };
}

/**
 * Resolve a log's start instant and duration in seconds. Timer entries carry
 * start/end (duration is null → compute it); duration-only entries carry an
 * explicit duration and a date but no clock time (start defaults to that date).
 */
export function deriveStartDuration(log: RawTimeLog): { start: string; durationSeconds: number } {
  let durationSeconds: number;
  if (log.duration != null) {
    durationSeconds = log.duration;
  } else if (log.startedAt && log.endedAt) {
    durationSeconds = Math.round((Date.parse(log.endedAt) - Date.parse(log.startedAt)) / 1000);
  } else {
    durationSeconds = 0;
  }

  let start: string;
  if (log.startedAt) {
    start = log.startedAt;
  } else if (log.date) {
    start = `${log.date}T00:00:00.000Z`;
  } else {
    throw new Error(`Time log ${log.id} has neither started_at nor date`);
  }

  return { start, durationSeconds };
}

async function fetchJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Report the path, never the query string — it carries the api_key.
    const path = safePath(url);
    throw new Error(`PayDirt request failed (${res.status}) for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

async function resolveNames(
  config: Config,
  jobId: string,
  fetchImpl: FetchLike,
  jobCache: Map<string, Record<string, unknown>>,
  projectCache: Map<string, Record<string, unknown>>,
): Promise<{ projectName: string; taskName: string }> {
  let job = jobCache.get(jobId);
  if (!job) {
    job = asRecord(extractObject(await fetchJson(buildJobUrl(config, jobId), fetchImpl), 'job'));
    jobCache.set(jobId, job);
  }

  const taskName = job.name == null ? '' : String(job.name);
  const projectId = job.project_id == null || job.project_id === '' ? '' : String(job.project_id);

  let projectName = '';
  if (projectId) {
    let project = projectCache.get(projectId);
    if (!project) {
      project = asRecord(
        extractObject(await fetchJson(buildProjectUrl(config, projectId), fetchImpl), 'project'),
      );
      projectCache.set(projectId, project);
    }
    projectName = project.name == null ? '' : String(project.name);
  }

  return { projectName, taskName };
}

/**
 * Fetch a day's client-scoped time entries, resolving each job_id to its PayDirt
 * project + task names. Server-side filtered by client_id and date.
 */
export async function fetchTimeEntries(
  config: Config,
  date: string,
  fetchImpl: FetchLike = fetch,
): Promise<PaydirtEntry[]> {
  const raw = await fetchJson(buildTimeUrl(config, { start: date, end: date }), fetchImpl);
  const logs = extractArray(raw).map(normalizeTimeLog);

  const jobCache = new Map<string, Record<string, unknown>>();
  const projectCache = new Map<string, Record<string, unknown>>();
  const entries: PaydirtEntry[] = [];

  for (const log of logs) {
    const { projectName, taskName } = await resolveNames(
      config,
      log.jobId,
      fetchImpl,
      jobCache,
      projectCache,
    );
    const { start, durationSeconds } = deriveStartDuration(log);
    entries.push({
      id: log.id,
      projectName,
      taskName,
      start,
      durationSeconds,
      notes: log.description,
    });
  }

  return entries;
}

/** Fetch the untouched PayDirt /time payload for the day — used by `--raw`. */
export async function fetchRaw(
  config: Config,
  date: string,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  return fetchJson(buildTimeUrl(config, { start: date, end: date }), fetchImpl);
}
