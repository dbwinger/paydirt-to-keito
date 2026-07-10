import { z } from 'zod';

const DEFAULT_BASE_URL = 'https://app.paydirtapp.com/api/v1';

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const schema = z.object({
  PAYDIRT_API_KEY: z
    .string({ required_error: 'PAYDIRT_API_KEY is required (set it in .env)' })
    .trim()
    .min(1, 'PAYDIRT_API_KEY is required (set it in .env)'),
  PAYDIRT_CLIENT_ID: z
    .string({
      required_error: 'PAYDIRT_CLIENT_ID is required (the PayDirt client id; set it in .env)',
    })
    .trim()
    .regex(/^\d+$/, 'PAYDIRT_CLIENT_ID must be a positive integer (the PayDirt client id)')
    .refine((v) => Number(v) > 0, 'PAYDIRT_CLIENT_ID must be a positive integer'),
  PAYDIRT_TIMEZONE: z
    .string({
      required_error: 'PAYDIRT_TIMEZONE is required (IANA zone, e.g. America/Denver; set it in .env)',
    })
    .trim()
    .min(1, 'PAYDIRT_TIMEZONE is required (IANA zone, e.g. America/Denver)')
    .refine(isValidTimeZone, 'PAYDIRT_TIMEZONE must be a valid IANA time zone (e.g. America/Denver)'),
  PAYDIRT_BASE_URL: z.string().trim().min(1).optional(),
});

export interface Config {
  apiKey: string;
  /** PayDirt client id — every fetch is scoped to this client only. */
  clientId: string;
  /** IANA zone PayDirt's UTC timestamps are converted into for the feed. */
  timeZone: string;
  baseUrl: string;
}

/**
 * Validate the PayDirt config out of an env-shaped object.
 *
 * Pure: reads only the object passed in (defaults to process.env at the call
 * site in cli.ts), so it is testable without touching the real environment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid configuration: ${message}`);
  }

  const baseUrl = (parsed.data.PAYDIRT_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');

  return {
    apiKey: parsed.data.PAYDIRT_API_KEY,
    clientId: parsed.data.PAYDIRT_CLIENT_ID,
    timeZone: parsed.data.PAYDIRT_TIMEZONE,
    baseUrl,
  };
}
