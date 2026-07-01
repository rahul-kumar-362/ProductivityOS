/**
 * Timer engine — authoritative owner. Runs ONLY in the main window (the sole
 * SQLite writer). Holds the active session, applies commands serially, persists
 * every transition, ticks the authoritative boundary check, and broadcasts
 * anchor snapshots to all windows. Crash recovery runs on init.
 *
 * Windows send intent via `timer://command` events; truth flows back via
 * `timer://state`. Elapsed is never stored — always derived from the anchor.
 */
import type { UnlistenFn } from '@tauri-apps/api/event';
import { listen, emit } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { TIMER } from '@/config/timer.config';
import { nowMs } from '@/db/time';
import type { SessionRow, StudyMethodRow } from '@/db/schema';
import { sessionsRepo } from '@/db/repositories/sessions.repo';
import { studyMethodsRepo } from '@/db/repositories/studyMethods.repo';
import { tasksRepo } from '@/db/repositories/tasks.repo';
import { recomputeDay } from '@/db/repositories/dayRollup.repo';
import { recomputeStreak } from '@/features/streaks/services/streak.service';
import { useTimerStore } from '@/stores/timer.store';
import {
  buildProtocol,
  decideRecovery,
  deriveBlockElapsedMs,
  isBlockComplete,
} from '../domain/protocol';
import { IDLE_SNAPSHOT, type Block, type TimerCommand, type TimerSnapshot } from '../domain/types';

class TimerEngine {
  private current: SessionRow | null = null;
  private protocol: Block[] = [];
  private method: StudyMethodRow | null = null;
  private queue: Promise<void> = Promise.resolve();
  private interval: ReturnType<typeof setInterval> | null = null;
  private unlisten: UnlistenFn[] = [];
  private started = false;

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.unlisten.push(
      await listen<TimerCommand>(EVENTS.timerCommand, (cmd) => this.enqueue(() => this.handle(cmd))),
    );
    this.unlisten.push(await listen(EVENTS.timerRequestState, () => this.broadcast()));
    this.enqueue(() => this.recover());
    this.interval = setInterval(() => this.enqueue(() => this.boundaryTick()), TIMER.boundaryTickMs);
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.unlisten.forEach((u) => u());
    this.unlisten = [];
    this.started = false;
  }

  private enqueue(fn: () => Promise<void>): void {
    this.queue = this.queue.then(fn).catch((e) => console.error('[timerEngine]', e));
  }

  /* ----------------------------- snapshot ----------------------------- */

  private snapshot(): TimerSnapshot {
    if (!this.current) return IDLE_SNAPSHOT;
    const c = this.current;
    return {
      status: c.status === 'running' || c.status === 'paused' ? c.status : 'idle',
      sessionId: c.id,
      taskId: c.taskId,
      methodId: c.studyMethodId,
      methodKind: c.methodKind,
      methodName: this.method?.name ?? null,
      protocol: this.protocol,
      blockIndex: c.blockIndex,
      accumulatedMs: c.accumulatedMs,
      runningSinceUtc: c.runningSinceUtc,
    };
  }

  private broadcast(): void {
    const snap = this.snapshot();
    useTimerStore.getState().setSnapshot(snap); // instant local update (main window)
    void emit(EVENTS.timerState, snap); // to all windows (floating)
  }

  /* ----------------------------- commands ----------------------------- */

  private async handle(cmd: TimerCommand): Promise<void> {
    switch (cmd.action) {
      case 'start':
        return this.start(cmd.methodId, cmd.taskId ?? null);
      case 'pause':
        return this.pause();
      case 'resume':
        return this.resume();
      case 'skip':
        return this.skip();
      case 'stop':
        return this.stop();
    }
  }

  private async start(methodId: number, taskId: number | null = null): Promise<void> {
    if (this.current && (this.current.status === 'running' || this.current.status === 'paused')) {
      await this.stop();
    }
    const method = await studyMethodsRepo.getById(methodId);
    if (!method) return;
    const protocol = buildProtocol(method);
    const row = await sessionsRepo.insertRunning({
      studyMethodId: method.id,
      taskId,
      methodKind: method.kind,
      timerName: null,
      protocolJson: JSON.stringify(protocol),
      targetSeconds: method.targetSeconds,
    });
    this.current = row;
    this.protocol = protocol;
    this.method = method;
    this.broadcast();
  }

  private async pause(): Promise<void> {
    const c = this.current;
    if (!c || c.status !== 'running') return;
    const now = nowMs();
    const banked = deriveBlockElapsedMs(c.accumulatedMs, c.runningSinceUtc, now);
    await this.patch({ accumulatedMs: banked, runningSinceUtc: null, status: 'paused' });
    this.broadcast();
  }

  private async resume(): Promise<void> {
    const c = this.current;
    if (!c || c.status !== 'paused') return;
    const now = nowMs();
    // Reset lastTickAt too, so time spent paused isn't seen as a freeze gap.
    await this.patch({ runningSinceUtc: now, status: 'running', lastTickAt: now });
    this.broadcast();
  }

  private async skip(): Promise<void> {
    if (!this.current || (this.current.status !== 'running' && this.current.status !== 'paused')) return;
    await this.advanceBlock(nowMs());
  }

  private async stop(): Promise<void> {
    const c = this.current;
    if (!c) return;
    const now = nowMs();
    const block = this.protocol[c.blockIndex];
    const elapsed = deriveBlockElapsedMs(c.accumulatedMs, c.runningSinceUtc, now);
    const { focusDelta, breakDelta } = this.blockDeltas(block, elapsed);
    await this.finalize(c, now, focusDelta, breakDelta, /*cycleDelta*/ 0);
  }

  /* ------------------------------ tick -------------------------------- */

  private async boundaryTick(): Promise<void> {
    let c = this.current;
    if (!c || c.status !== 'running') return;
    const now = nowMs();

    // Freeze/sleep guard: if the tick was frozen far longer than expected
    // (sleep/hibernate/heavy throttle), credit at most maxRecoverableMs of the
    // gap and drop the rest by shifting the anchor forward — so focus time
    // (task + session) is never inflated by unattended time. Mirrors recover().
    const gap = now - (c.lastTickAt ?? now);
    if (gap > TIMER.maxRecoverableMs && c.runningSinceUtc !== null) {
      await this.patch({
        runningSinceUtc: c.runningSinceUtc + (gap - TIMER.maxRecoverableMs),
        lastTickAt: now,
      });
      c = this.current;
      if (!c) return;
    }

    const block = this.protocol[c.blockIndex];
    const elapsed = deriveBlockElapsedMs(c.accumulatedMs, c.runningSinceUtc, now);
    if (isBlockComplete(block ?? null, elapsed)) {
      await this.advanceBlock(now);
      return;
    }
    // Heartbeat (crash-safety liveness) — cheap, throttled.
    if (!c.lastTickAt || now - c.lastTickAt >= TIMER.heartbeatMs) {
      await sessionsRepo.heartbeat(c.id, now);
      c.lastTickAt = now;
      this.broadcast(); // keep windows re-synced on the anchor periodically
    }
  }

  /* --------------------------- block advance -------------------------- */

  private blockDeltas(
    block: Block | undefined,
    blockElapsedMs: number,
  ): { focusDelta: number; breakDelta: number } {
    const secs = Math.round(blockElapsedMs / 1000);
    if (block?.kind === 'focus') return { focusDelta: secs, breakDelta: 0 };
    return { focusDelta: 0, breakDelta: secs };
  }

  private async advanceBlock(now: number): Promise<void> {
    const c = this.current;
    if (!c) return;
    const block = this.protocol[c.blockIndex];
    const elapsed = deriveBlockElapsedMs(c.accumulatedMs, c.runningSinceUtc, now);
    const { focusDelta, breakDelta } = this.blockDeltas(block, elapsed);
    const cycleDelta = block?.kind === 'focus' ? 1 : 0;

    const nextIndex = c.blockIndex + 1;
    void emit(EVENTS.timerBlockComplete, { kind: block?.kind ?? 'focus', blockIndex: c.blockIndex });

    if (nextIndex >= this.protocol.length) {
      await this.finalize(c, now, focusDelta, breakDelta, cycleDelta);
      return;
    }

    const next = this.protocol[nextIndex];
    const autoStart = this.shouldAutoStart(block, next);
    await this.patch({
      focusSeconds: c.focusSeconds + focusDelta,
      breakSeconds: c.breakSeconds + breakDelta,
      completedCycles: c.completedCycles + cycleDelta,
      blockIndex: nextIndex,
      accumulatedMs: 0,
      runningSinceUtc: autoStart ? now : null,
      status: autoStart ? 'running' : 'paused',
    });
    this.broadcast();
  }

  private shouldAutoStart(prev: Block | undefined, next: Block | undefined): boolean {
    if (!next) return false;
    if (prev?.kind === 'focus' && (next.kind === 'break' || next.kind === 'longBreak')) {
      return this.method?.autoStartBreak ?? true;
    }
    if ((prev?.kind === 'break' || prev?.kind === 'longBreak') && next.kind === 'focus') {
      return this.method?.autoStartNextFocus ?? false;
    }
    return true;
  }

  private async finalize(
    c: SessionRow,
    now: number,
    focusDelta: number,
    breakDelta: number,
    cycleDelta: number,
  ): Promise<void> {
    await this.patch({
      status: 'completed',
      endedAt: now,
      runningSinceUtc: null,
      accumulatedMs: 0,
      focusSeconds: c.focusSeconds + focusDelta,
      breakSeconds: c.breakSeconds + breakDelta,
      completedCycles: c.completedCycles + cycleDelta,
    });
    if (c.taskId) await tasksRepo.addSpent(c.taskId, c.focusSeconds + focusDelta);
    const localDay = c.localDay;
    void emit(EVENTS.timerFinished, { sessionId: c.id });
    this.current = null;
    this.protocol = [];
    this.method = null;
    await recomputeDay(localDay);
    await recomputeStreak();
    this.broadcast();
  }

  /* ---------------------------- recovery ------------------------------ */

  private async recover(): Promise<void> {
    const row = await sessionsRepo.findActive();
    if (!row) {
      this.broadcast();
      return;
    }
    this.current = row;
    this.protocol = row.protocolJson ? (JSON.parse(row.protocolJson) as Block[]) : [];
    this.method = row.studyMethodId ? await studyMethodsRepo.getById(row.studyMethodId) : null;

    if (row.status === 'paused') {
      this.broadcast();
      return;
    }

    // status === 'running' (app died mid-run)
    const result = decideRecovery(
      {
        status: 'running',
        accumulatedMs: row.accumulatedMs,
        runningSinceUtc: row.runningSinceUtc,
        lastTickAt: row.lastTickAt,
        startedAt: row.startedAt,
        now: nowMs(),
      },
      { recoveryLiveThresholdMs: TIMER.recoveryLiveThresholdMs, maxRecoverableMs: TIMER.maxRecoverableMs },
    );

    if (result.finalize) {
      const block = this.protocol[row.blockIndex];
      const { focusDelta, breakDelta } = this.blockDeltas(block, result.accumulatedMs);
      const endedAt = row.lastTickAt ?? nowMs();
      await this.patch({
        status: 'completed',
        endedAt,
        runningSinceUtc: null,
        accumulatedMs: 0,
        focusSeconds: row.focusSeconds + focusDelta,
        breakSeconds: row.breakSeconds + breakDelta,
      });
      if (row.taskId) await tasksRepo.addSpent(row.taskId, row.focusSeconds + focusDelta);
      const localDay = row.localDay;
      this.current = null;
      this.protocol = [];
      this.method = null;
      await recomputeDay(localDay);
      await recomputeStreak();
    } else {
      await this.patch({ accumulatedMs: result.accumulatedMs, runningSinceUtc: null, status: 'paused' });
    }
    this.broadcast();
  }

  /* ------------------------- persistence helper ----------------------- */

  /** Apply a patch to the in-memory row AND the DB together (single writer). */
  private async patch(p: Partial<SessionRow>): Promise<void> {
    if (!this.current) return;
    this.current = { ...this.current, ...p };
    await sessionsRepo.update(this.current.id, p);
  }
}

export const timerEngine = new TimerEngine();
