import { z } from 'zod';
import type { KeitoTarget, MatchVia } from './types.js';

/** PayDirt project name → task name → Keito target. */
export type Mapping = Record<string, Record<string, KeitoTarget>>;

export interface Match {
  target: KeitoTarget;
  via: MatchVia;
}

const targetSchema = z
  .object({
    keitoClient: z.string().trim().default(''),
    keitoProject: z.string().trim().min(1, 'keitoProject is required'),
    keitoProjectId: z.string().trim().default(''),
    keitoTask: z.string().trim().min(1, 'keitoTask is required'),
    keitoTaskId: z.string().trim().default(''),
  })
  .transform(
    (t): KeitoTarget => ({
      client: t.keitoClient,
      project: t.keitoProject,
      projectId: t.keitoProjectId,
      task: t.keitoTask,
      taskId: t.keitoTaskId,
    }),
  );

const mappingSchema = z.record(z.string(), z.record(z.string(), targetSchema));

/** Validate a parsed mapping.json object, defaulting blank Keito ids. */
export function loadMapping(raw: unknown): Mapping {
  const parsed = mappingSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid mapping.json: ${message}`);
  }
  return parsed.data;
}

/** Trim and collapse internal whitespace; case and punctuation are preserved. */
export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** A loose comparison key: lowercase, punctuation reduced to single spaces. */
export function matchKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Resolve a PayDirt project+task to a Keito target.
 *
 * 1. An explicit `mapping.json` override wins — matched case/space/punct-
 *    insensitively (`via: 'override'`).
 * 2. Otherwise, when `passthrough` is on, the PayDirt names carry through
 *    unchanged (only whitespace-normalized) as the Keito names
 *    (`via: 'passthrough'`).
 * 3. With `passthrough` off (strict), an unmatched pair returns undefined so the
 *    caller can surface it as unmapped.
 */
export function resolveMatch(
  mapping: Mapping,
  project: string,
  task: string,
  options: { passthrough: boolean },
): Match | undefined {
  const wantProject = matchKey(project);
  const wantTask = matchKey(task);

  for (const [mProject, tasks] of Object.entries(mapping)) {
    if (matchKey(mProject) !== wantProject) continue;
    for (const [mTask, target] of Object.entries(tasks)) {
      if (matchKey(mTask) === wantTask) {
        return { target, via: 'override' };
      }
    }
  }

  if (!options.passthrough) return undefined;

  return {
    via: 'passthrough',
    target: {
      client: '',
      project: normalizeWhitespace(project),
      projectId: '',
      task: normalizeWhitespace(task),
      taskId: '',
    },
  };
}
