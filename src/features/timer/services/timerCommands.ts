/**
 * Fire-and-forget timer commands. Any window (main or floating) emits these;
 * the main-window engine is the sole handler. Callers do NOT mutate local state —
 * they wait for the resulting `timer://state` broadcast, guaranteeing both
 * windows stay identical.
 */
import { emit } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import type { TimerCommand } from '../domain/types';

const send = (cmd: TimerCommand) => emit(EVENTS.timerCommand, cmd);

export const timerCommands = {
  start: (methodId: number, taskId?: number | null) => send({ action: 'start', methodId, taskId }),
  pause: () => send({ action: 'pause' }),
  resume: () => send({ action: 'resume' }),
  skip: () => send({ action: 'skip' }),
  stop: () => send({ action: 'stop' }),
  requestState: () => emit(EVENTS.timerRequestState),
};
