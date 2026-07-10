import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs as nodeParseArgs } from 'node:util';
import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { KeitoBrowserSink } from './keito/sink.js';
import { loadMapping, type Mapping } from './mapping.js';
import { fetchRaw, fetchTimeEntries } from './paydirt.js';
import { JsonSink } from './sink.js';
import { todayInZone } from './time.js';
import { buildDay } from './transform.js';

export interface CliOptions {
  date: string | undefined;
  out: string | undefined;
  raw: boolean;
  allowUnmapped: boolean;
  strict: boolean;
  push: boolean;
  dryRun: boolean;
  headed: boolean;
  autoLogin: boolean;
  mapping: string;
  help: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const { values } = nodeParseArgs({
    args: argv,
    options: {
      date: { type: 'string' },
      out: { type: 'string' },
      raw: { type: 'boolean', default: false },
      'allow-unmapped': { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      push: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      'auto-login': { type: 'boolean', default: false },
      mapping: { type: 'string', default: 'mapping.json' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    throw new Error(`--date must be YYYY-MM-DD (got "${values.date}")`);
  }

  return {
    date: values.date,
    out: values.out,
    raw: values.raw ?? false,
    allowUnmapped: values['allow-unmapped'] ?? false,
    strict: values.strict ?? false,
    push: values.push ?? false,
    dryRun: values['dry-run'] ?? false,
    headed: values.headed ?? false,
    autoLogin: values['auto-login'] ?? false,
    mapping: values.mapping ?? 'mapping.json',
    help: values.help ?? false,
  };
}

const HELP = `paydirt-to-keito — fetch a day's time for one PayDirt client, map it, and
either emit a JSON feed or push it into Keito's web timesheet.

Usage:
  paydirt-to-keito [--date YYYY-MM-DD] [--out FILE] [--mapping FILE] [--raw] [--allow-unmapped]
  paydirt-to-keito --push [--date YYYY-MM-DD] [--dry-run] [--headed] [--auto-login] [--mapping FILE]

Options:
  --date YYYY-MM-DD   Day to fetch (default: today in PAYDIRT_TIMEZONE).
  --out FILE          Write the feed to FILE (default: stdout).
  --mapping FILE      Mapping config path (default: mapping.json).
  --raw               Dump the untouched PayDirt /time payload and exit (schema probe).
  --strict            Disable name passthrough; require an explicit mapping for every pair.
  --allow-unmapped    Exit 0 even if some entries are unmapped (strict mode only).
  --push              Drive Keito's web form to create the mapped entries.
  --dry-run           With --push: print the resolved plan without opening a browser.
  --headed            With --push: run the browser visibly.
  --auto-login        With --push: if no valid Keito session, open a browser to sign in first.
  -h, --help          Show this help.

By default (no --push), a PayDirt project/task not found in the mapping passes
through using its own name as the Keito name. Use --strict to turn that off.

--push always requires an explicit mapping per pair (unmapped entries are skipped
and reported); it needs a saved Keito session — create one with: npm run keito:login.

Config comes from .env: PAYDIRT_API_KEY, PAYDIRT_CLIENT_ID, PAYDIRT_TIMEZONE, [PAYDIRT_BASE_URL].`;

async function loadMappingFile(path: string): Promise<Mapping> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new Error(
      `Mapping file not found at "${path}". Copy mapping.example.json to ${path} and fill it in.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Mapping file "${path}" is not valid JSON: ${(err as Error).message}`);
  }

  return loadMapping(parsed);
}

export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  dotenv.config();
  const config = loadConfig();
  const date = options.date ?? todayInZone(config.timeZone);

  if (options.raw) {
    const raw = await fetchRaw(config, date);
    process.stdout.write(`${JSON.stringify(raw, null, 2)}\n`);
    return;
  }

  const mapping = await loadMappingFile(options.mapping);
  const entries = await fetchTimeEntries(config, date);

  if (options.push) {
    // Push requires explicit mappings; passthrough names can't hit Keito's
    // client-grouped projects and coded tasks. Unmapped pairs are skipped.
    const day = buildDay(date, entries, mapping, config.timeZone, { passthrough: false });
    const sink = new KeitoBrowserSink({
      authPath: process.env.KEITO_AUTH_PATH ?? '.keito-auth.json',
      statePath: process.env.KEITO_STATE_PATH ?? '.keito-pushed.json',
      headed: options.headed,
      dryRun: options.dryRun,
      autoLogin: options.autoLogin,
    });
    await sink.write(day);
    return;
  }

  const day = buildDay(date, entries, mapping, config.timeZone, { passthrough: !options.strict });

  await new JsonSink(options.out).write(day);

  const passedThrough = day.entries.filter((e) => e.via === 'passthrough');
  if (passedThrough.length > 0) {
    process.stderr.write(
      `${passedThrough.length} entr${passedThrough.length === 1 ? 'y' : 'ies'} used name passthrough (no override) — verify the Keito names:\n`,
    );
    for (const e of passedThrough) {
      process.stderr.write(`  passthrough: ${e.keito.project} / ${e.keito.task}\n`);
    }
  }

  if (day.unmapped.length > 0) {
    for (const u of day.unmapped) {
      process.stderr.write(`unmapped: ${u.project} / ${u.task} (${u.durationSeconds}s)\n`);
    }
    if (!options.allowUnmapped) {
      process.stderr.write(
        `\n${day.unmapped.length} entr${day.unmapped.length === 1 ? 'y has' : 'ies have'} no mapping. ` +
          `Add ${day.unmapped.length === 1 ? 'it' : 'them'} to "${options.mapping}" or pass --allow-unmapped.\n`,
      );
      process.exitCode = 1;
    }
  }
}

// Run only when invoked directly (tsx src/cli.ts / node dist/cli.js), not on import.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
