import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { addPushed, hasPushed, loadPushed, parsePushed, savePushed } from './state.js';

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('parsePushed', () => {
  it('returns an empty record for null/undefined', () => {
    expect(parsePushed(null)).toEqual({});
    expect(parsePushed(undefined)).toEqual({});
  });

  it('accepts a valid record shape', () => {
    const raw = { '2026-07-09': ['5209796', '5209783'] };
    expect(parsePushed(raw)).toEqual(raw);
  });

  it('throws on a non-object', () => {
    expect(() => parsePushed('nope')).toThrow();
  });

  it('throws when a value is not an array of strings', () => {
    expect(() => parsePushed({ '2026-07-09': 'x' })).toThrow();
  });
});

describe('hasPushed / addPushed', () => {
  it('reports false for an unseen id', () => {
    expect(hasPushed({}, '2026-07-09', '5209796')).toBe(false);
  });

  it('reports true after adding', () => {
    const r = addPushed({}, '2026-07-09', '5209796');
    expect(hasPushed(r, '2026-07-09', '5209796')).toBe(true);
  });

  it('scopes ids to their date', () => {
    const r = addPushed({}, '2026-07-09', '5209796');
    expect(hasPushed(r, '2026-07-10', '5209796')).toBe(false);
  });

  it('does not duplicate an id already present', () => {
    let r = addPushed({}, '2026-07-09', '5209796');
    r = addPushed(r, '2026-07-09', '5209796');
    expect(r['2026-07-09']).toEqual(['5209796']);
  });
});

describe('loadPushed / savePushed', () => {
  it('returns an empty record when the file does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'p2k-state-'));
    dirs.push(dir);
    expect(await loadPushed(join(dir, 'nope.json'))).toEqual({});
  });

  it('round-trips a saved record', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'p2k-state-'));
    dirs.push(dir);
    const path = join(dir, '.keito-pushed.json');
    const record = addPushed({}, '2026-07-09', '5209796');

    await savePushed(path, record);

    const written = JSON.parse(await readFile(path, 'utf8'));
    expect(written).toEqual(record);
    expect(await loadPushed(path)).toEqual(record);
  });
});
