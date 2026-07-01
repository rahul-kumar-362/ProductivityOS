import type { TaskRow } from '@/db/schema';
import { TaskItem } from './TaskItem';
import type { TaskFocus } from '../hooks/useTaskFocus';

export function TaskList({
  items,
  timer,
  onToggle,
  onRename,
  onRemove,
  onSetEstimate,
}: {
  items: TaskRow[];
  timer: TaskFocus;
  onToggle: (t: TaskRow) => void;
  onRename: (id: number, title: string) => void;
  onRemove: (id: number) => void;
  onSetEstimate: (id: number, minutes: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          timer={timer}
          onToggle={() => onToggle(t)}
          onRename={(v) => onRename(t.id, v)}
          onRemove={() => onRemove(t.id)}
          onSetEstimate={(m) => onSetEstimate(t.id, m)}
        />
      ))}
    </div>
  );
}
