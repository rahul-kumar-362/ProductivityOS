import { describe, expect, it } from 'vitest';
import { computeStreaks, qualifiesDay } from './streak';

describe('qualifiesDay', () => {
  const min = 7200; // 2h
  it('qualifies when all tasks done', () => {
    expect(qualifiesDay({ tasksTotal: 3, tasksCompleted: 3, focusSeconds: 0 }, min)).toBe(true);
  });
  it('does not qualify with partial tasks and low focus', () => {
    expect(qualifiesDay({ tasksTotal: 3, tasksCompleted: 2, focusSeconds: 100 }, min)).toBe(false);
  });
  it('qualifies on enough focus even with no tasks', () => {
    expect(qualifiesDay({ tasksTotal: 0, tasksCompleted: 0, focusSeconds: 7200 }, min)).toBe(true);
  });
  it('empty day does not qualify', () => {
    expect(qualifiesDay({ tasksTotal: 0, tasksCompleted: 0, focusSeconds: 0 }, min)).toBe(false);
  });
});

describe('computeStreaks', () => {
  it('counts a consecutive run ending today', () => {
    const days = ['2026-06-29', '2026-06-30', '2026-07-01'];
    expect(computeStreaks(days, '2026-07-01')).toEqual({ current: 3, longest: 3 });
  });

  it('today not yet qualified counts back from yesterday', () => {
    const days = ['2026-06-29', '2026-06-30'];
    expect(computeStreaks(days, '2026-07-01')).toEqual({ current: 2, longest: 2 });
  });

  it('a gap breaks the current streak but longest survives', () => {
    const days = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-30', '2026-07-01'];
    expect(computeStreaks(days, '2026-07-01')).toEqual({ current: 2, longest: 3 });
  });

  it('no qualified days => zero', () => {
    expect(computeStreaks([], '2026-07-01')).toEqual({ current: 0, longest: 0 });
  });

  it('missing yesterday and today => current 0', () => {
    expect(computeStreaks(['2026-06-28'], '2026-07-01')).toEqual({ current: 0, longest: 1 });
  });
});
