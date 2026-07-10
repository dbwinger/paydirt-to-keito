import { login } from './session.js';

const authPath = process.env.KEITO_AUTH_PATH ?? '.keito-auth.json';

login({ authPath }).catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
