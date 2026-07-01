import { useDerivedElapsed } from './useDerivedElapsed';
import { timerCommands } from '../services/timerCommands';
import { formatMs } from '@/shared/lib/format';

/** Composed timer API for components. Presentation reads this; zero logic in JSX. */
export function useTimer() {
  const d = useDerivedElapsed();
  const { snapshot } = d;
  const isActive = snapshot.status === 'running' || snapshot.status === 'paused';
  const blockLabel =
    d.block?.label ?? (d.block?.kind === 'focus' ? 'Focus' : d.block ? 'Break' : '');

  return {
    status: snapshot.status,
    methodName: snapshot.methodName,
    methodId: snapshot.methodId,
    blockKind: d.block?.kind ?? null,
    blockLabel,
    display: formatMs(d.displayMs),
    isCountUp: d.isCountUp,
    isActive,
    start: timerCommands.start,
    pause: timerCommands.pause,
    resume: timerCommands.resume,
    stop: timerCommands.stop,
    skip: timerCommands.skip,
  };
}
