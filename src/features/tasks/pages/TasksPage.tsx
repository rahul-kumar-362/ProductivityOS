import { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { PageHeader } from '@/shared/components/ui/PageHeader';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { TaskComposer } from '../components/TaskComposer';
import { TaskList } from '../components/TaskList';
import { useTasks } from '../hooks/useTasks';
import { useTaskQuery } from '../hooks/useTaskQuery';
import { useTaskFocus } from '../hooks/useTaskFocus';
import { taskService } from '../services/task.service';

type Tab = 'today' | 'pending' | 'completed';
const TABS: Tab[] = ['today', 'pending', 'completed'];

export function TasksPage() {
  const [tab, setTab] = useState<Tab>('today');
  return (
    <div className="mx-auto max-w-3xl p-8">
      <PageHeader title="Tasks" subtitle="Plan your day and track what's done." />
      <div className="mb-4 flex w-fit gap-1 rounded-lg border border-border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-body-sm capitalize transition-colors duration-fast ease-out ${
              tab === t ? 'bg-surface-hover text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'today' && <TodayTab />}
      {tab === 'pending' && <QueryTab fetcher={taskService.listPending} emptyTitle="No pending tasks" />}
      {tab === 'completed' && (
        <QueryTab fetcher={taskService.listCompleted} emptyTitle="Nothing completed yet" />
      )}
    </div>
  );
}

function TodayTab() {
  const timer = useTaskFocus();
  const { pending, completed, loading, add, toggle, rename, remove, setEstimate } = useTasks();
  if (loading) return <ListSkeleton />;
  return (
    <div className="space-y-4">
      <TaskComposer onAdd={add} />
      {pending.length === 0 && completed.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks today" description="Add your first task above." />
      ) : (
        <>
          <TaskList
            items={pending}
            timer={timer}
            onToggle={toggle}
            onRename={rename}
            onRemove={remove}
            onSetEstimate={setEstimate}
          />
          {completed.length > 0 && (
            <div>
              <p className="mb-1.5 mt-4 text-caption text-text-muted">Completed ({completed.length})</p>
              <TaskList
                items={completed}
                timer={timer}
                onToggle={toggle}
                onRename={rename}
                onRemove={remove}
                onSetEstimate={setEstimate}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QueryTab({
  fetcher,
  emptyTitle,
}: {
  fetcher: () => Promise<import('@/shared/lib/result').Result<import('@/db/schema').TaskRow[]>>;
  emptyTitle: string;
}) {
  const timer = useTaskFocus();
  const { items, loading, toggle, rename, remove, setEstimate } = useTaskQuery(fetcher);
  if (loading) return <ListSkeleton />;
  if (items.length === 0) return <EmptyState icon={CheckSquare} title={emptyTitle} />;
  return (
    <TaskList
      items={items}
      timer={timer}
      onToggle={toggle}
      onRename={rename}
      onRemove={remove}
      onSetEstimate={setEstimate}
    />
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
