import { useTimerStore } from '@/stores/timer.store';
import { timerCommands } from '@/features/timer/services/timerCommands';
import type { BlockKind, EngineStatus } from '@/features/timer/domain/types';

const DEFAULT_METHOD_ID = 1; // Pomodoro

export interface TaskFocus {
  activeTaskId: number | null;
  activeStatus: EngineStatus;
  /** kind of the block currently running on the active task (focus vs break). */
  activeKind: BlockKind | null;
  start: (taskId: number) => void;
  pause: () => void;
  resume: () => void;
}

/** Which task (if any) the timer is currently on, plus controls to drive it. */
export function useTaskFocus(): TaskFocus {
  const snapshot = useTimerStore((s) => s.snapshot);
  const active = snapshot.status === 'running' || snapshot.status === 'paused';
  const block = active ? snapshot.protocol[snapshot.blockIndex] : undefined;
  return {
    activeTaskId: active ? snapshot.taskId : null,
    activeStatus: snapshot.status,
    activeKind: block?.kind ?? null,
    start: (taskId) => void timerCommands.start(DEFAULT_METHOD_ID, taskId),
    pause: () => void timerCommands.pause(),
    resume: () => void timerCommands.resume(),
  };
}
