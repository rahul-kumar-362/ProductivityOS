import { dayOfMonth, isSameMonth } from '@/shared/lib/date';
import type { DayColor, DayRollupRow } from '@/db/schema';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cellColor(color: DayColor | undefined): string {
  switch (color) {
    case 'green':
      return 'bg-success/15 text-success';
    case 'yellow':
      return 'bg-warning/15 text-warning';
    case 'red':
      return 'bg-danger/15 text-danger';
    default:
      return 'text-text-secondary';
  }
}

export function CalendarGrid({
  matrix,
  rollups,
  year,
  month,
  today,
  selected,
  onSelect,
}: {
  matrix: string[][];
  rollups: Record<string, DayRollupRow>;
  year: number;
  month: number;
  today: string;
  selected: string | null;
  onSelect: (day: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-caption text-text-muted">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {matrix.flat().map((day) => {
          const inMonth = isSameMonth(day, year, month);
          const r = rollups[day];
          const isToday = day === today;
          const isSel = day === selected;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              className={`grid aspect-square place-items-center rounded-lg border text-body-sm transition-colors duration-fast ease-out ${cellColor(
                r?.color,
              )} ${inMonth ? '' : 'opacity-35'} ${
                isSel ? 'border-primary' : 'border-transparent hover:border-border-strong'
              } ${isToday ? 'ring-1 ring-primary' : ''}`}
            >
              <span className={isToday ? 'font-semibold text-text-primary' : ''}>{dayOfMonth(day)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
