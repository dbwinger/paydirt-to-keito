import type { Locator, Page } from 'playwright';

const BASE_URL = 'https://app.keito.ai/time?view=day';

/** One Keito time entry, fully resolved to what the form needs. */
export interface ResolvedEntry {
  /** Keito client (may be blank); disambiguates same-named projects. */
  client: string;
  /** Exact Keito project name (typed into the project search). */
  project: string;
  /** Distinctive substring of the Keito task label (typed into the task search). */
  task: string;
  notes: string;
  /** 12-hour clock, e.g. "6:13 PM". */
  startClock: string;
  endClock: string;
  /** Expected Keito-derived duration, e.g. "0:29", asserted before saving. */
  expectedDuration: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keito shows a cookie-consent dialog in a fresh session. Decline it (the most
 * privacy-preserving choice); never auto-accept.
 */
async function dismissCookieBanner(page: Page): Promise<void> {
  for (const name of [/reject/i, /decline/i, /only necessary/i]) {
    const btn = page.getByRole('button', { name });
    if (await btn.count()) {
      await btn.first().click().catch(() => {});
      return;
    }
  }
}

/** Navigate the day view to `date` (YYYY-MM-DD) and confirm the app is ready. */
export async function goToDay(page: Page, date: string): Promise<void> {
  await page.goto(`${BASE_URL}&date=${date}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Track time' }).first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await dismissCookieBanner(page);
}

/**
 * Keito's project/task pickers are `cmdk` searchboxes inside a Radix dialog that
 * carries `aria-hidden` — so `getByRole` can't see its contents. Everything here
 * is located by CSS / placeholder / text instead. The project search auto-opens
 * with the modal; the task search opens on click. `optionText` is an exact
 * RegExp for the project (so "Contoso" doesn't also match "ContosoPartners.com")
 * and a substring for the task (its label is code-prefixed).
 */
async function chooseFromCombo(
  page: Page,
  dialog: Locator,
  pickerIndex: number,
  placeholder: string,
  term: string,
  optionText: string | RegExp,
  label: string,
): Promise<void> {
  const search = page.getByPlaceholder(placeholder, { exact: true });
  if (!(await search.isVisible().catch(() => false))) {
    await dialog.locator('button[role="combobox"]').nth(pickerIndex).click();
    await search.waitFor({ state: 'visible', timeout: 5000 });
  }

  await search.fill(term);
  const options = page.locator('[role="option"]').filter({ hasText: optionText });
  try {
    await options.first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    throw new Error(`No Keito option matched ${label}. Check the mapping term.`);
  }
  const count = await options.count();
  if (count > 1) {
    throw new Error(`${count} Keito options matched ${label}; make the mapping term more specific.`);
  }
  await options.first().click();
  await search.waitFor({ state: 'detached', timeout: 5000 });
}

/**
 * Fill and save one time entry on the currently-shown day. Any mismatch
 * (ambiguous/missing project or task, or a duration that does not match) throws
 * *before* Save is clicked, so nothing partial is written.
 */
export async function addEntry(page: Page, e: ResolvedEntry): Promise<void> {
  await page.getByRole('button', { name: 'Track time' }).first().click();

  const dialog = page.locator('[role="dialog"]').filter({ hasText: 'New time entry' });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  await chooseFromCombo(
    page,
    dialog,
    0,
    'Search...',
    e.project,
    new RegExp(`^${escapeRegExp(e.project)}$`),
    `project "${e.project}"`,
  );
  await chooseFromCombo(page, dialog, 1, 'Search tasks...', e.task, e.task, `task "${e.task}"`);

  await dialog.getByPlaceholder('Notes (optional)').fill(e.notes);
  const times = dialog.getByPlaceholder('1:15 PM');
  await times.nth(0).fill(e.startClock);
  await times.nth(1).fill(e.endClock);

  // Self-check: Keito derives the duration from the two times we typed.
  const shown = await readDuration(dialog);
  if (shown !== e.expectedDuration) {
    throw new Error(
      `Keito shows duration ${shown} but expected ${e.expectedDuration} ` +
        `for ${e.startClock}–${e.endClock}; not saving.`,
    );
  }

  await dialog.locator('button').filter({ hasText: /^Save$/ }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
}

async function readDuration(dialog: Locator): Promise<string> {
  const text = await dialog.getByText(/Duration:/).innerText();
  const match = text.match(/Duration:\s*(\d+:\d{2})/);
  if (!match) {
    throw new Error(`Could not read the duration Keito displayed (saw "${text}").`);
  }
  return match[1] as string;
}
