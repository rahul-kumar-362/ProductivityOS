import { PanelTopClose, PanelTopOpen } from 'lucide-react';
import { TimerPanel } from '@/features/timer/components/TimerPanel';
import { TaskComposer } from '@/features/tasks/components/TaskComposer';
import { TaskList } from '@/features/tasks/components/TaskList';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useTaskFocus } from '@/features/tasks/hooks/useTaskFocus';
import { useFloatingWindow } from '@/features/timer/hooks/useFloatingWindow';
import { StreakBadge } from '@/features/streaks/components/StreakBadge';
import { Card } from '@/shared/components/ui/Card';
import { IconButton } from '@/shared/components/ui/IconButton';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Dashboard() {
  const { open, close } = useFloatingWindow();
  const tasks = useTasks();
  const timer = useTaskFocus();

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-text-primary">{greeting()}</h1>
          <p className="text-body text-text-secondary">Let's make today count.</p>
        </div>
        <div className="flex items-center gap-3">
          <StreakBadge />
          <div className="flex gap-2">
            <IconButton label="Open floating timer" onClick={open}>
              <PanelTopOpen size={16} />
            </IconButton>
            <IconButton label="Close floating timer" onClick={close}>
              <PanelTopClose size={16} />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <TimerPanel />

        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-h3 text-text-primary">Today</h2>
            <span className="text-caption text-text-muted">
              {tasks.pending.length} to do · {tasks.completed.length} done
            </span>
          </div>
          <TaskComposer onAdd={tasks.add} />
          <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
            {tasks.pending.length === 0 ? (
              <p className="py-6 text-center text-body-sm text-text-muted">
                No tasks yet — add one above.
              </p>
            ) : (
              <TaskList
                items={tasks.pending.slice(0, 8)}
                timer={timer}
                onToggle={tasks.toggle}
                onRename={tasks.rename}
                onRemove={tasks.remove}
                onSetEstimate={tasks.setEstimate}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
