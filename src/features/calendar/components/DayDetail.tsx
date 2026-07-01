import { Flame } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { formatDurationShort } from '@/shared/lib/format';
import { todayLocalDay } from '@/db/time';
import { streakService } from '@/features/streaks/services/streak.service';
import { useDayDetail } from '../hooks/useDayDetail';

export function DayDetail({ day }: { day: string }) {
  const { tasks, rollup, loading } = useDayDetail(day);
  const done = tasks.filter((t) => t.status === 'completed').length;
  const focus = rollup?.focusSeconds ?? 0;
  const isPast = day < todayLocalDay();
  const canRestore = isPast && rollup?.color !== 'green';

  const restore = async () => {
    const r = await streakService.restore(day);
    if (!r.ok) window.alert(r.error.message ?? 'Could not restore this day.');
  };

  return (
    <Card className="p-5">
      <h3 className="text-h3 text-text-primary">{day}</h3>
      {loading ? (
        <p className="mt-3 text-body-sm text-text-muted">Loading…</p>
      ) : (
        <>
          <div className="mt-3 flex gap-4 text-body-sm text-text-secondary">
            <span>
              {done}/{tasks.length} tasks
            </span>
            <span>{formatDurationShort(focus)} focus</span>
          </div>
          <div className="mt-4 space-y-1">
            {tasks.length === 0 ? (
              <p className="text-body-sm text-text-muted">No tasks.</p>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id}
                  className={`text-body-sm ${
                    t.status === 'completed' ? 'text-text-muted line-through' : 'text-text-primary'
                  }`}
                >
                  • {t.title}
                </div>
              ))
            )}
          </div>
          {canRestore && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={restore}>
              <Flame size={14} /> Restore streak day
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
