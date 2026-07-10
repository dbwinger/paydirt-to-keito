import { describe, expect, it } from 'vitest';
import { todayInZone, toZonedIso, zonedRange } from './time.js';

describe('toZonedIso', () => {
  it('converts a UTC instant into a DST offset (Denver, summer)', () => {
    expect(toZonedIso('2013-06-20T11:30:00.000Z', 'America/Denver')).toBe(
      '2013-06-20T05:30:00-06:00',
    );
  });

  it('converts a UTC instant into a standard-time offset (Denver, winter)', () => {
    expect(toZonedIso('2026-01-15T18:00:00.000Z', 'America/Denver')).toBe(
      '2026-01-15T11:00:00-07:00',
    );
  });

  it('handles a New York summer offset', () => {
    expect(toZonedIso('2026-07-09T13:00:00.000Z', 'America/New_York')).toBe(
      '2026-07-09T09:00:00-04:00',
    );
  });

  it('emits a +00:00 offset for UTC', () => {
    expect(toZonedIso('2026-07-09T09:00:00.000Z', 'UTC')).toBe('2026-07-09T09:00:00+00:00');
  });

  it('rolls the date backward when the local time is the previous day', () => {
    expect(toZonedIso('2026-07-09T04:00:00.000Z', 'America/Denver')).toBe(
      '2026-07-08T22:00:00-06:00',
    );
  });

  it('throws on an unparseable instant', () => {
    expect(() => toZonedIso('not-a-date', 'America/Denver')).toThrow();
  });
});

describe('zonedRange', () => {
  it('returns start and end (start + duration) both in the target zone', () => {
    expect(zonedRange('2013-06-20T11:30:00.000Z', 5400, 'America/Denver')).toEqual({
      start: '2013-06-20T05:30:00-06:00',
      end: '2013-06-20T07:00:00-06:00',
    });
  });

  it('crosses midnight in local time correctly', () => {
    expect(zonedRange('2026-07-09T05:00:00.000Z', 7200, 'America/Denver')).toEqual({
      start: '2026-07-08T23:00:00-06:00',
      end: '2026-07-09T01:00:00-06:00',
    });
  });
});

describe('todayInZone', () => {
  it('returns the local calendar date in the given zone', () => {
    // 04:00 UTC is still the previous evening in Denver.
    expect(todayInZone('America/Denver', new Date('2026-07-09T04:00:00.000Z'))).toBe('2026-07-08');
  });

  it('returns the UTC date when the zone is UTC', () => {
    expect(todayInZone('UTC', new Date('2026-07-09T04:00:00.000Z'))).toBe('2026-07-09');
  });
});
