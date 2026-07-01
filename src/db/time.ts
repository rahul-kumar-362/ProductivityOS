/**
 * The ONLY place `Date` is read/formatted. Keeps time logic centralized,
 * testable, and out of components/services.
 */
export const nowMs = (): number => Date.now();

/**
 * Freeze the LOCAL wall-clock calendar day (YYYY-MM-DD) for an instant.
 * Written at insert time; never re-derived from an epoch at read time.
 * Critical at UTC-3 (Argentina) to avoid off-by-one-day calendar/streak bugs.
 */
export function toLocalDay(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const todayLocalDay = (): string => toLocalDay(nowMs());
