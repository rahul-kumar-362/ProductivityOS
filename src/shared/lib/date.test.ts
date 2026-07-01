import { describe, expect, it } from 'vitest';
import { addDays, dayKey, dayOfMonth, isSameMonth, monthMatrix, parseDay, prevDay } from './date';

describe('date keys', () => {
  it('pads month/day', () => {
    expect(dayKey(2026, 7, 1)).toBe('2026-07-01');
    expect(dayKey(2026, 12, 25)).toBe('2026-12-25');
  });

  it('parses', () => {
    expect(parseDay('2026-02-09')).toEqual({ year: 2026, month: 2, day: 9 });
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(prevDay('2026-01-01')).toBe('2025-12-31');
  });

  it('handles leap year Feb', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // 2024 leap
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // 2026 not leap
  });
});

describe('monthMatrix', () => {
  it('is 6 weeks x 7 days and contains the first of the month', () => {
    const m = monthMatrix(2026, 7);
    expect(m).toHaveLength(6);
    expect(m.every((w) => w.length === 7)).toBe(true);
    const flat = m.flat();
    expect(flat).toContain('2026-07-01');
    expect(flat).toContain('2026-07-31');
  });

  it('starts on a Sunday', () => {
    const m = monthMatrix(2026, 7);
    const firstCell = m[0]?.[0];
    expect(firstCell).toBeDefined();
    // day-of-week of first cell is Sunday(0)
    const p = parseDay(firstCell!);
    expect(new Date(p.year, p.month - 1, p.day).getDay()).toBe(0);
  });
});

describe('helpers', () => {
  it('isSameMonth', () => {
    expect(isSameMonth('2026-07-15', 2026, 7)).toBe(true);
    expect(isSameMonth('2026-06-30', 2026, 7)).toBe(false);
  });
  it('dayOfMonth', () => {
    expect(dayOfMonth('2026-07-09')).toBe(9);
  });
});
