/**
 * Local-timezone-safe day-key math. A day key is 'YYYY-MM-DD' built from LOCAL
 * wall-clock components (never derived from a UTC epoch at read time), matching
 * db/time.ts:toLocalDay. All arithmetic goes through Date's local constructor so
 * month/year boundaries, leap years, and DST are handled correctly.
 */
const pad = (n: number): string => String(n).padStart(2, '0');

/** month is 1-12. */
export const dayKey = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

export function parseDay(key: string): { year: number; month: number; day: number } {
  const parts = key.split('-');
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
}

export function toDate(key: string): Date {
  const { year, month, day } = parseDay(key);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, delta: number): string {
  const d = toDate(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export const prevDay = (key: string): string => addDays(key, -1);
export const nextDay = (key: string): string => addDays(key, 1);

/** 6x7 matrix of day keys (weeks Sun..Sat) covering `month` (1-12). */
export function monthMatrix(year: number, month: number): string[][] {
  const first = new Date(year, month - 1, 1);
  const startDow = first.getDay(); // 0 = Sunday
  const cursor = new Date(year, month - 1, 1 - startDow);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(dayKey(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

export const isSameMonth = (key: string, year: number, month: number): boolean => {
  const p = parseDay(key);
  return p.year === year && p.month === month;
};

export const dayOfMonth = (key: string): number => parseDay(key).day;
