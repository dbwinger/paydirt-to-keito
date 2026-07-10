# paydirt-to-keito

Fetch a day's [PayDirt](https://paydirtapp.com) time entries for one client,
map their PayDirt project/task names to your Keito equivalents, and emit a clean
structured JSON feed.

This eliminates the read-and-retype half of logging the same hours in Keito. The
feed is designed to drive a future Keito writer (its API, its CLI, or a web-form
filler) — but that writer is **not built yet**. Today the tool stops at JSON.

## How it works

```
PayDirt /time (client + date filtered)  ──►  resolve job_id ──►  map names ──►  JSON feed
        time_logs                              /jobs, /projects      mapping.json
```

- PayDirt's `/v1/time` returns entries with only a `job_id` — no project/task
  names. The client resolves each `job_id` via `/v1/jobs/{id}` (the job `name`
  is your **task**) and its `project_id` via `/v1/projects/{id}` (the project
  `name` is your **project**). The `description` field becomes `notes`. Lookups
  are cached per run.
- Fetches are scoped server-side to `PAYDIRT_CLIENT_ID` and the requested date,
  so only that client's time is ever pulled.
- One output record per PayDirt entry. `start` is kept and `end = start +
  duration`.

## Requirements

- Node.js ≥ 20 (uses the built-in `fetch`).

## Install

```bash
npm install
```

## Configure

### 1. Secrets — `.env`

Copy the example and fill it in. `.env` is gitignored; never commit it.

```bash
cp .env.example .env
```

| Variable            | Required | Notes                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------- |
| `PAYDIRT_API_KEY`   | yes      | From PayDirt → Password Settings. Sent as the `api_key` query param.   |
| `PAYDIRT_CLIENT_ID` | yes      | The client id to scope fetches to. Find it via `GET /api/v1/clients` (`id`). |
| `PAYDIRT_TIMEZONE`  | yes      | IANA zone your day view uses, e.g. `America/Denver`. See timezone note.|
| `PAYDIRT_BASE_URL`  | no       | Defaults to `https://app.paydirtapp.com/api/v1`.                       |

To find your client's id:

```bash
curl "https://app.paydirtapp.com/api/v1/clients?api_key=YOUR_KEY"
```

### 2. Mapping — `mapping.json`

By default the tool assumes your PayDirt and Keito names **mostly match**, so you
only map the exceptions. `mapping.json` holds overrides for the pairs whose names
genuinely differ. It is gitignored (it can reveal a client's project structure); a
`mapping.example.json` is committed to show the format.

```bash
cp mapping.example.json mapping.json
```

```json
{
  "Contoso Website/App": {
    "Support/Maintenance": {
      "keitoClient": "Northwind Agency",
      "keitoProject": "Contoso",
      "keitoTask": "Support"
    }
  }
}
```

- Top-level keys are PayDirt **project** names (the project a job belongs to);
  second-level keys are PayDirt **task** names (the job name).
- `keitoProject` and `keitoTask` are what gets typed into Keito's project/task
  **search boxes** when pushing (see [Pushing into Keito](#pushing-into-keito)).
  `keitoProject` must match a Keito project exactly; `keitoTask` need only be a
  distinctive substring of Keito's (often code-prefixed) task label — e.g.
  `"Support"` resolves `"2105-01 Support/Maintenance"`.
- `keitoClient` disambiguates the client-grouped project picker. Optional, but
  set it when the same project name exists under more than one client.
- `keitoProjectId` / `keitoTaskId` are unused by the browser push (reserved for a
  possible future REST sink) and may be omitted.

#### How names are matched

For each PayDirt entry, in order:

1. **Override** — an exact `mapping.json` entry, matched case/space/punctuation-
   insensitively (so `"UI Development"` matches `"ui  development"`). Tagged
   `"via": "override"`.
2. **Passthrough** — no override found, so the PayDirt names carry through as the
   Keito names (only whitespace is tidied; case and punctuation are left alone,
   so `"API"` stays `"API"`). Tagged `"via": "passthrough"`, and every passthrough
   is printed to stderr so you can verify it.

Passthrough entries are never silently trusted — review the stderr list, and add
an override for any whose Keito name should differ.

Pass `--strict` to disable passthrough entirely: then any pair without an
override is reported as `unmapped` (never guessed), and the command exits
non-zero unless you also pass `--allow-unmapped`. Use it to audit which pairs
lack an explicit mapping.

## Usage

```bash
# Today's feed to stdout
npm run dev

# A specific day
npm run dev -- --date 2026-07-09

# Write to a file
npm run dev -- --date 2026-07-09 --out day.json

# Inspect the raw PayDirt payload (schema probe / debugging)
npm run probe -- --date 2026-07-09
```

### Options

| Flag               | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `--date YYYY-MM-DD`| Day to fetch. Default: today in `PAYDIRT_TIMEZONE`.                 |
| `--out FILE`       | Write the feed to FILE. Default: stdout.                           |
| `--mapping FILE`   | Mapping config path. Default: `mapping.json`.                      |
| `--raw`            | Dump the untouched PayDirt `/time` payload and exit.               |
| `--strict`         | Disable passthrough; require an override for every pair.           |
| `--allow-unmapped` | Exit 0 even if some entries are unmapped (strict mode only).       |
| `--push`           | Drive Keito's web form to create the mapped entries (see below).   |
| `--dry-run`        | With `--push`: print the resolved plan without opening a browser.  |
| `--headed`         | With `--push`: run the browser visibly.                            |
| `--auto-login`     | With `--push`: sign in first if no valid Keito session (`sync`).   |
| `-h`, `--help`     | Show help.                                                         |

In `--strict` mode the command exits non-zero when any entry is unmapped (unless
`--allow-unmapped`), after still writing the feed and listing the unmapped
entries on stderr.

## Output shape

```json
{
  "date": "2026-07-09",
  "entries": [
    {
      "paydirt": { "id": "321", "project": "Acme Website Redesign", "task": "Frontend", "notes": "Working on website design" },
      "keito":   { "project": "Website Redesign", "projectId": "", "task": "UI Development", "taskId": "" },
      "via": "override",
      "start": "2026-07-09T09:00:00-06:00",
      "end":   "2026-07-09T10:30:00-06:00",
      "durationSeconds": 5400
    }
  ],
  "unmapped": [
    { "id": "322", "project": "Acme Support", "task": "Bug Fixes", "durationSeconds": 1800, "notes": "…" }
  ]
}
```

## Notes & caveats

- **Timezone.** PayDirt stores timestamps in UTC. `start`/`end` are converted to
  `PAYDIRT_TIMEZONE` (DST-aware) so they match your day view. `durationSeconds`
  is timezone-independent.
- **Duration-only entries.** PayDirt entries logged without a timer have no clock
  time — just a date and a duration. For these, `start` defaults to midnight
  (`00:00:00`) on that date.
- **Provisional against real data.** The client is written to PayDirt's
  documented schema. If a real payload differs, run `--raw` to inspect it and
  adjust `src/paydirt.ts` (`normalizeTimeLog` / `extractArray`) and the fixture
  `test/fixtures/paydirt-time.sample.json`.

## Pushing into Keito

Keito has no API for this workspace, so the push drives its web timesheet with
Playwright: it pulls the day from PayDirt, maps it, then for each mapped entry
opens "Track time", types the mapped project/task search terms and picks the
match, fills the notes and the start/end clock times, verifies Keito's derived
duration, and saves.

### One command: `sync`

```bash
npm run sync -- --date 2026-07-09
```

This does the whole job end to end — fetch from PayDirt, map, and write into
Keito. If there's no valid Keito session it opens a browser so you can **sign in
by hand first** (no password is ever handled by the tool), saves the session to
`.keito-auth.json` (gitignored), then continues. When the session is still
valid it skips straight to pushing, headlessly. Re-runs are safe (see below), so
this is the day-to-day command. Add `--headed` to watch it, `--dry-run` to just
print the plan.

### Or run the steps yourself

Sign in once (whenever the session expires):

```bash
npm run keito:login
```

This opens a browser; sign in to Keito by hand. The session is saved to
`.keito-auth.json`. **No password is handled by the tool** — you type it
yourself in that window.

Then, per day (`push` assumes a valid session and never opens a login browser):

```bash
# See exactly what would be pushed — no browser, no writes
npm run push -- --date 2026-07-09 --dry-run

# Push for real
npm run push -- --date 2026-07-09

# Watch it happen
npm run push -- --date 2026-07-09 --headed
```

- **Explicit mapping required.** `--push` runs in strict mode: only pairs with a
  `mapping.json` override are pushed. Unmapped pairs are skipped and listed
  (Keito's coded task names and client-grouped projects can't be guessed).
- **Duration-faithful.** `start` = PayDirt start, `end = start + duration`, so
  Keito's derived duration equals your billed PayDirt hours.
- **Re-run safe.** Each pushed entry's PayDirt id is recorded per date in
  `.keito-pushed.json` (gitignored); running again skips what's already there, so
  you never double-enter.
- **Self-checking.** Before saving each entry, the tool asserts Keito's displayed
  `Duration:` matches the expected span; a mismatch aborts that entry (nothing
  half-written) and is reported. A push-all run continues past a failed entry and
  exits non-zero with a summary; fix the mapping and re-run to retry only the
  failures.

Everything still flows through the `TimeEntrySink` interface (`src/sink.ts`):
`JsonSink` writes JSON, `KeitoBrowserSink` (`src/keito/`) drives the browser.

## Development

```bash
npm test         # run the test suite (vitest)
npm run test:watch
npm run typecheck
npm run build    # emit dist/
```

Pure logic (`config`, `time`, `mapping`, `transform`, `paydirt` normalizers) is
covered by unit tests. The `paydirt` network path is tested with an injected
`fetch`. End-to-end verification needs real credentials in `.env`.
