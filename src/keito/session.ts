import { access } from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const KEITO_URL = 'https://app.keito.ai/time?view=day';
/** The timesheet's "Track time" button only renders when authenticated. */
const LOGGED_IN_MARKER = 'Track time';

export interface KeitoSession {
  page: Page;
  close(): Promise<void>;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function trackTimeButton(page: Page) {
  return page.getByRole('button', { name: LOGGED_IN_MARKER }).first();
}

/**
 * Launch chromium with the saved Keito session and land on the timesheet.
 * Throws with a clear message if there is no saved session or it has expired.
 */
export async function openSession(opts: {
  authPath: string;
  headed?: boolean;
}): Promise<KeitoSession> {
  if (!(await fileExists(opts.authPath))) {
    throw new Error(`No saved Keito session at "${opts.authPath}". Run: npm run keito:login`);
  }

  const browser: Browser = await chromium.launch({ headless: !opts.headed });
  const context: BrowserContext = await browser.newContext({ storageState: opts.authPath });
  const page = await context.newPage();
  await page.goto(KEITO_URL, { waitUntil: 'domcontentloaded' });

  try {
    await trackTimeButton(page).waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    await browser.close();
    throw new Error('Keito session expired or not logged in. Run: npm run keito:login');
  }

  return {
    page,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

/**
 * Open a Keito session, signing in first if there is no saved session or it
 * has expired. On the first failure it runs the interactive `login` (a visible
 * browser you sign into by hand) and then retries once. Use this for the
 * one-command sync; `openSession` alone is for callers that must already be
 * authenticated.
 */
export async function ensureSession(opts: {
  authPath: string;
  headed?: boolean;
}): Promise<KeitoSession> {
  try {
    return await openSession(opts);
  } catch {
    process.stderr.write('No valid Keito session — signing in first.\n');
    await login({ authPath: opts.authPath });
    return openSession(opts);
  }
}

/**
 * Open a visible browser, let the user sign in by hand, then persist the
 * session. No password is ever handled by this code.
 */
export async function login(opts: { authPath: string }): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(KEITO_URL, { waitUntil: 'domcontentloaded' });

  process.stderr.write(
    'A browser window opened. Sign in to Keito — the session saves automatically ' +
      'once your timesheet loads (up to 3 minutes)...\n',
  );

  await trackTimeButton(page).waitFor({ state: 'visible', timeout: 180_000 });
  await context.storageState({ path: opts.authPath });
  process.stderr.write(`Saved Keito session to ${opts.authPath}.\n`);

  await context.close();
  await browser.close();
}
