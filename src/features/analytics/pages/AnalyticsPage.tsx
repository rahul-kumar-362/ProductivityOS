import { PageHeader } from '@/shared/components/ui/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { StatCard } from '@/shared/components/ui/StatCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { formatDurationShort } from '@/shared/lib/format';
import { StudyHoursChart } from '../components/StudyHoursChart';
import { useAnalytics } from '../hooks/useAnalytics';

export function AnalyticsPage() {
  const { view, loading } = useAnalytics(14);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader title="Analytics" subtitle="Last 14 days." />

      {loading || !view ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Focus time" value={formatDurationShort(view.totalFocusSeconds)} sub="14-day total" />
            <StatCard label="Tasks done" value={String(view.totalTasksCompleted)} sub="14-day total" />
            <StatCard label="Completion" value={`${Math.round(view.completionRate * 100)}%`} sub="of scheduled tasks" />
            <StatCard label="Streak" value={`${view.currentStreak}`} sub={`longest ${view.longestStreak}`} />
          </div>

          <Card className="p-5">
            <h2 className="mb-4 text-h3 text-text-primary">Focus hours</h2>
            <StudyHoursChart data={view.daily} />
          </Card>
        </div>
      )}
    </div>
  );
}
