import { useState } from 'react';
import { Check, Clock, Coffee, Pause, Play, Trash2 } from 'lucide-react';
import type { TaskRow } from '@/db/schema';
import { ProgressRing } from '@/shared/components/ui/ProgressRing';
import type { TaskFocus } from '../hooks/useTaskFocus';

export function TaskItem({
  task,
  timer,
  onToggle,
  onRename,
  onRemove,
  onSetEstimate,
}: {
  task: TaskRow;
  timer: TaskFocus;
  onToggle: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  onSetEstimate: (minutes: number) => void;
}) {
  const done = task.status === 'completed';
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(task.title);
  const [editEst, setEditEst] = useState(false);
  const [estVal, setEstVal] = useState(String(task.estimateMinutes ?? ''));

  const est = task.estimateMinutes ?? 0;
  const hasEst = est > 0;
  const spentMin = Math.round(task.spentSeconds / 60);
  const pct = hasEst ? task.spentSeconds / (est * 60) : 0;
  const complete = hasEst && pct >= 1;
  const isActive = timer.activeTaskId === task.id;
  const isRunning = isActive && timer.activeStatus === 'running';
  const isBreak = isActive && (timer.activeKind === 'break' || timer.activeKind === 'longBreak');

  const onFocusClick = () => {
    if (isRunning) timer.pause();
    else if (isActive) timer.resume();
    else timer.start(task.id);
  };

  const openEst = () => {
    setEstVal(task.estimateMinutes ? String(task.estimateMinutes) : '');
    setEditEst(true);
  };
  const saveEst = () => {
    setEditEst(false);
    const n = Number(estVal);
    onSetEstimate(Number.isFinite(n) && n > 0 ? n : 0);
  };

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 ${
        isActive ? 'border-primary/60' : 'border-border'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? 'Mark pending' : 'Mark done'}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-colors duration-fast ease-out ${
          done ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong hover:border-primary'
        }`}
      >
        {done && <Check size={13} />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            setEditing(false);
            const t = val.trim();
            if (t && t !== task.title) onRename(t);
            else setVal(task.title);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setVal(task.title);
              setEditing(false);
            }
          }}
          className="flex-1 bg-transparent text-body text-text-primary outline-none"
        />
      ) : (
        <span
          onDoubleClick={() => {
            setVal(task.title);
            setEditing(true);
          }}
          className={`flex-1 cursor-text truncate text-body ${
            done ? 'text-text-muted line-through' : 'text-text-primary'
          }`}
        >
          {task.title}
        </span>
      )}

      {/* estimate text / editor */}
      {editEst ? (
        <input
          autoFocus
          type="number"
          min={0}
          value={estVal}
          onChange={(e) => setEstVal(e.target.value)}
          onBlur={saveEst}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setEstVal(String(task.estimateMinutes ?? ''));
              setEditEst(false);
            }
          }}
          placeholder="min"
          className="h-7 w-16 shrink-0 rounded-md border border-border bg-surface-elevated px-2 text-caption tabular-nums text-text-primary outline-none focus-visible:border-primary"
        />
      ) : hasEst ? (
        <button
          type="button"
          onClick={openEst}
          className="shrink-0 text-caption tabular-nums text-text-muted hover:text-text-primary"
          title="Edit estimate"
        >
          {spentMin}/{est}m
        </button>
      ) : (
        <button
          type="button"
          onClick={openEst}
          aria-label="Set time estimate"
          title="Set time estimate"
          className="shrink-0 text-text-muted opacity-0 transition-opacity hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Clock size={15} />
        </button>
      )}

      {/* focus control: ring when an estimate exists, else a plain play/pause */}
      {hasEst ? (
        <button
          type="button"
          onClick={onFocusClick}
          aria-label={
            isBreak ? 'On a break — pause' : isRunning ? 'Pause focus' : isActive ? 'Resume focus' : 'Start focus'
          }
          className="shrink-0"
        >
          <ProgressRing pct={pct} tone={complete ? 'success' : 'primary'} size={30}>
            {isBreak ? (
              <Coffee size={12} className="text-warning" />
            ) : isRunning ? (
              <Pause size={12} className="text-text-primary" />
            ) : (
              <Play size={12} className={isActive ? 'text-primary' : 'text-text-secondary'} />
            )}
          </ProgressRing>
        </button>
      ) : (
        <button
          type="button"
          onClick={onFocusClick}
          aria-label={
            isBreak ? 'On a break — pause' : isRunning ? 'Pause focus' : isActive ? 'Resume focus' : 'Start focus'
          }
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          {isBreak ? (
            <Coffee size={15} className="text-warning" />
          ) : isRunning ? (
            <Pause size={15} />
          ) : (
            <Play size={15} />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Delete task"
        className="shrink-0 text-text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
