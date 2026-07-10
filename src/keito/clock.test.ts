import { describe, expect, it } from 'vitest';
import { dayFromIso, formatDuration, toClockTime } from './clock.js';

describe('toClockTime', () => {
  it('formats an afternoon time as 12-hour with PM', () => {
    expect(toClockTime('2026-07-09T18:13:00+02:00')).toBe('6:13 PM');
  });

  it('keeps noon as 12 PM', () => {
    expect(toClockTime('2026-07-09T12:59:59+02:00')).toBe('12:59 PM');
  });

  it('renders midnight as 12 AM', () => {
    expect(toClockTime('2026-07-09T00:00:00+02:00')).toBe('12:00 AM');
  });

  it('renders a morning time with AM and no leading zero on the hour', () => {
    expect(toClockTime('2026-07-09T09:05:00-06:00')).toBe('9:05 AM');
  });

  it('reads the wall clock, not the runtime timezone (ignores the offset value)', () => {
    // Same wall time, different offsets — output must be identical.
    expect(toClockTime('2026-07-09T13:05:00+00:00')).toBe('1:05 PM');
    expect(toClockTime('2026-07-09T13:05:00+09:00')).toBe('1:05 PM');
  });

  it('renders late evening correctly', () => {
    expect(toClockTime('2026-07-09T23:59:00+02:00')).toBe('11:59 PM');
  });

  it('throws on an unparseable value', () => {
    expect(() => toClockTime('not-a-time')).toThrow();
  });
});

describe('formatDuration', () => {
  it('formats sub-hour durations as 0:mm matching Keito', () => {
    expect(formatDuration(1740)).toBe('0:29');
    expect(formatDuration(2640)).toBe('0:44');
  });

  it('formats hour-plus durations as h:mm', () => {
    expect(formatDuration(4500)).toBe('1:15');
    expect(formatDuration(3600)).toBe('1:00');
  });

  it('rounds to whole minutes', () => {
    expect(formatDuration(89)).toBe('0:01');
  });
});

describe('dayFromIso', () => {
  it('extracts the calendar date', () => {
    expect(dayFromIso('2026-07-09T18:13:00+02:00')).toBe('2026-07-09');
  });

  it('throws on an unparseable value', () => {
    expect(() => dayFromIso('nope')).toThrow();
  });
});
