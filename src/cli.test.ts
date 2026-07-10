import { describe, expect, it } from 'vitest';
import { parseArgs } from './cli.js';

describe('parseArgs', () => {
  it('applies defaults with no flags', () => {
    expect(parseArgs([])).toEqual({
      date: undefined,
      out: undefined,
      raw: false,
      allowUnmapped: false,
      strict: false,
      push: false,
      dryRun: false,
      headed: false,
      autoLogin: false,
      mapping: 'mapping.json',
      help: false,
    });
  });

  it('parses date, out, mapping, and boolean flags', () => {
    const opts = parseArgs([
      '--date',
      '2026-07-09',
      '--out',
      'day.json',
      '--mapping',
      'custom.json',
      '--raw',
      '--allow-unmapped',
      '--strict',
      '--push',
      '--dry-run',
      '--headed',
      '--auto-login',
    ]);
    expect(opts).toEqual({
      date: '2026-07-09',
      out: 'day.json',
      raw: true,
      allowUnmapped: true,
      strict: true,
      push: true,
      dryRun: true,
      headed: true,
      autoLogin: true,
      mapping: 'custom.json',
      help: false,
    });
  });

  it('supports -h for help', () => {
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(() => parseArgs(['--date', '07/09/2026'])).toThrow(/--date/);
  });
});
