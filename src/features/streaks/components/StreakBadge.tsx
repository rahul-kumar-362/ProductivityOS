import { Flame } from 'lucide-react';
import { useStreak } from '../hooks/useStreak';

export function StreakBadge() {
  const s = useStreak();
  const n = s?.currentStreak ?? 0;
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5"
      title={`Longest streak: ${s?.longestStreak ?? 0} days`}
    >
      <Flame size={15} className={n > 0 ? 'text-warning' : 'text-text-muted'} />
      <span className="text-body-sm font-medium tabular-nums text-text-primary">{n}</span>
      <span className="text-caption text-text-muted">day{n === 1 ? '' : 's'}</span>
    </div>
  );
}
