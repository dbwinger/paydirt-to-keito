import { describe, expect, it } from 'vitest';
import { loadMapping, matchKey, normalizeWhitespace, resolveMatch } from './mapping.js';

const raw = {
  'Acme Website Redesign': {
    'UI Development': {
      keitoClient: 'Acme Co',
      keitoProject: 'Website Redesign',
      keitoProjectId: 'proj_1',
      keitoTask: 'Interface',
      keitoTaskId: 'task_9',
    },
  },
};

describe('loadMapping', () => {
  it('parses a valid mapping and defaults missing client/ids to empty strings', () => {
    const mapping = loadMapping({ P: { T: { keitoProject: 'KP', keitoTask: 'KT' } } });
    expect(mapping['P']?.['T']).toEqual({
      client: '',
      project: 'KP',
      projectId: '',
      task: 'KT',
      taskId: '',
    });
  });

  it('carries keitoClient through as the target client', () => {
    const mapping = loadMapping({
      P: { T: { keitoClient: 'Northwind Agency', keitoProject: 'Contoso', keitoTask: 'SEO' } },
    });
    expect(mapping['P']?.['T']?.client).toBe('Northwind Agency');
  });

  it('throws when a target is missing keitoProject', () => {
    expect(() => loadMapping({ P: { T: { keitoTask: 'x' } } })).toThrow(/keitoProject/);
  });

  it('throws when the top level is not an object of objects', () => {
    expect(() => loadMapping({ P: 'nope' })).toThrow();
  });
});

describe('normalizeWhitespace', () => {
  it('trims and collapses internal whitespace, preserving case and punctuation', () => {
    expect(normalizeWhitespace('  UI   Development ')).toBe('UI Development');
    expect(normalizeWhitespace('bug-fixes')).toBe('bug-fixes');
  });
});

describe('matchKey', () => {
  it('lowercases and reduces punctuation to single spaces', () => {
    expect(matchKey('UI-Development!')).toBe('ui development');
    expect(matchKey('Bug_Fixes')).toBe('bug fixes');
    expect(matchKey('  UI   Development ')).toBe('ui development');
  });
});

describe('resolveMatch', () => {
  const mapping = loadMapping(raw);

  it('returns an override match despite case/space/punct differences', () => {
    const match = resolveMatch(mapping, 'acme website redesign', 'ui  development', {
      passthrough: true,
    });
    expect(match).toEqual({
      via: 'override',
      target: {
        client: 'Acme Co',
        project: 'Website Redesign',
        projectId: 'proj_1',
        task: 'Interface',
        taskId: 'task_9',
      },
    });
  });

  it('passes an unmatched pair through using the PayDirt names', () => {
    const match = resolveMatch(mapping, 'Acme Support', '  Bug   Fixes ', {
      passthrough: true,
    });
    expect(match).toEqual({
      via: 'passthrough',
      target: {
        client: '',
        project: 'Acme Support',
        projectId: '',
        task: 'Bug Fixes',
        taskId: '',
      },
    });
  });

  it('returns undefined for an unmatched pair when passthrough is off (strict)', () => {
    expect(resolveMatch(mapping, 'Unknown', 'Thing', { passthrough: false })).toBeUndefined();
  });

  it('still returns the override in strict mode', () => {
    const match = resolveMatch(mapping, 'Acme Website Redesign', 'UI Development', {
      passthrough: false,
    });
    expect(match?.via).toBe('override');
  });
});
