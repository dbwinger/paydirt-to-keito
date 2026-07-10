# Keito browser sink — design

Date: 2026-07-10

## Context

`paydirt-to-keito` already fetches a day's PayDirt time for one client, maps
PayDirt project/task names to Keito equivalents, and emits a
structured JSON feed (`DayOutput`) through a pluggable `TimeEntrySink`. Only
`JsonSink` exists today.

This spec adds the write side: a sink that drives Keito's web UI to create the
time entries, eliminating the retype-into-Keito half of the workflow. Keito has
no API access for this workspace, so we automate the browser.

The approach and the form flow were validated live on 2026-07-10: after clearing
a day of hand-entered entries, the exact click sequence below was driven by hand
through Keito and reproduced the day identically (day total returned to 4.40,
same tasks/notes/times/durations).

## Confirmed decisions

- **Mechanism: standalone Playwright script.** Not the Keito API (unavailable),
  not Claude-in-Chrome (needs a human/agent in the loop each run), not a
  userscript. A deterministic, testable Node/Playwright script in the same
  codebase.
- **End-time semantics: duration-faithful.** `start` = PayDirt start,
  `end = start + PayDirt duration`. Keito stores start+end and derives the
  duration; duration-faithful makes Keito's billed duration equal PayDirt's.
- **Safety: push-all by default.** No per-entry prompt. An opt-in `--dry-run`
  prints the plan without opening a browser. Re-run dedup (below) prevents
  double-entry.
- **Matching: explicit mapping only for Keito.** Keito task labels are coded
  (`2105-01 Support/Maintenance`) and the project name differs from PayDirt
  (`Contoso Website/App` → `Contoso`), so name passthrough does not apply on the
  Keito side. `mapping.json` must resolve every pushed pair.

## Keito form facts (mapped live)

- Page: `app.keito.ai/time?view=day`. "+ Track time" opens a "New time entry"
  modal.
- **Project**: searchable dropdown, grouped by client. Typing filters; pick the
  exact result.
- **Task**: searchable dropdown of coded, per-project labels. Typing a
  distinctive substring filters to one result.
- **Notes**: free text, optional.
- **Start time** / **End time**: 12-hour clock text (`6:13 PM`). The modal shows
  `Duration: h:mm` derived from the two times. The day list rounds the displayed
  hours up to 0.1h; the stored entry is exact.
- **Date**: set by which day the sheet is showing, not a form field. How the
  script lands on an arbitrary date is resolved by a quick probe during
  implementation: try a URL date param first, fall back to the "Choose date"
  picker, then to Previous/Next stepping. Whichever works becomes `form.ts`'s
  `goToDay(date)`.
- **Delete**: trash icon, no confirmation dialog (instant).
- No native `confirm()`/`alert()` dialogs on save or delete.

## Architecture

The existing fetch → map → `DayOutput` core is unchanged. New code lives under
`src/keito/` and plugs in behind `TimeEntrySink`.

| Module | Responsibility |
|---|---|
| `src/keito/session.ts` | Launch Playwright; load/save auth `storageState`. One-time `keito:login` opens headed for manual sign-in and persists the session. Detect an expired session and fail with a clear message. |
| `src/keito/clock.ts` | Pure `toClockTime(iso)` → `"6:13 PM"`; date extraction for day-view navigation. Unit-tested. |
| `src/keito/form.ts` | Page object: `addEntry(page, resolved)` runs the validated flow (navigate day → Track time → project → task → notes → start/end → assert duration → Save → wait for row). |
| `src/keito/state.ts` | Dedup store in gitignored `.keito-pushed.json`, keyed by `${date}:${paydirtId}`. Pure read/write, unit-tested. |
| `src/keito/sink.ts` | `KeitoBrowserSink implements TimeEntrySink`. Iterates `DayOutput.entries`; skips already-pushed and unmapped; drives `form.addEntry`; records success in state; collects and reports failures. |

**Data flow:** `cli --push` → existing `fetchTimeEntries` → `buildDay` →
`KeitoBrowserSink.write(day)` → per entry `form.addEntry` → Keito.

## Mapping schema change

`mapping.json` moves from display names to Keito **search terms** plus a client
to disambiguate the client-grouped project picker. Per PayDirt project/task:

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

- `keitoClient` — disambiguates when the same project name exists under two
  clients. Optional; required only on ambiguity.
- `keitoProject` — term typed into the project search; the sink asserts the
  clicked option matches exactly (and under `keitoClient` when given).
- `keitoTask` — term typed into the task search; must resolve to exactly one
  option.

Captured mapping to seed `mapping.example.json` / the user's `mapping.json`
(project `Contoso Website/App`, client `Northwind Agency`, project `Contoso`):

| PayDirt task | keitoTask term | resolves to |
|---|---|---|
| Support/Maintenance | Support | 2105-01 Support/Maintenance |
| SEO help | SEO | SEO Help |
| Lead forms on series pages | Lead forms | Lead forms on series pages |
| Cookie consent upgrade | Cookie | 2167-01 - Cookie consent upgrade |

The existing `KeitoTarget` (`project`, `projectId`, `task`, `taskId`) is
extended/repurposed: `project`/`task` carry the search terms; a `client` field
is added; `projectId`/`taskId` remain unused by this sink (reserved for a future
REST sink).

## CLI

New push path on the existing CLI:

```
npm run push -- --date 2026-07-09 [--dry-run] [--headed]
```

- default: fetch + map + drive Keito, saving every mapped, not-yet-pushed entry.
- `--dry-run`: resolve the feed and print the plan (client/project/task/times/
  notes per entry, plus skipped/unmapped) without launching a browser.
- `--headed`: run the browser visibly to watch it.
- `--date`: day to push (default today in `PAYDIRT_TIMEZONE`).
- `keito:login` script (separate): one-time manual sign-in to create the session.

## Error handling

- Task or project search yields 0 or >1 results → skip that entry, report it
  (mapping term too vague / wrong).
- Keito's derived `Duration:` ≠ PayDirt duration → skip that entry, report
  (guards against a mistyped time).
- Expired/invalid session → stop with "run `npm run keito:login` again."
- Push-all continues past a failed entry, records only successes in the dedup
  state, and prints a failure summary at the end. Re-running retries only the
  failures.

## Testing

- **TDD, unit-tested (vitest):** `clock.toClockTime`, mapping → search-term
  resolution, `state` read/write and dedup keying.
- **Playwright driver (`form.ts`, `session.ts`):** validated by a real run
  against Keito (as done manually on 2026-07-10), not mocked. This mirrors the
  existing project convention where `paydirt.ts`'s network path is injected /
  manually verified rather than mocked against a fake server. A static HTML
  fixture cannot reproduce Keito's React typeahead dropdowns, so a mock would
  test the mock, not the behavior. The in-form `Duration:` assertion gives the
  driver a self-check at runtime.

## Security / gitignore

- `.keito-auth.json` (Playwright storageState — a live session) — gitignored,
  never committed.
- `.keito-pushed.json` (dedup state) — gitignored.
- No Keito password is ever handled by the script; sign-in is manual in the
  headed `keito:login` browser.

## Out of scope

- Editing or deleting existing Keito entries (create-only).
- A Keito REST sink (would reuse the same `mapping.json` ids; deferred unless
  API access appears).
- Clients other than the configured one (the fetch side already scopes to one client).
