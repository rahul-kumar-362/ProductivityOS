# Design: timer-engine

> A crash-safe, timestamp-based timer + session engine that stores startedAt + accumulated elapsed and derives current elapsed from the wall clock, so it survives crashes, sleep, and DST. A single source of truth in the Rust backend owns session state and persists a durable Session row on every state transition; the React UI (main + floating window) is a thin renderer that ticks locally for display only. Modes (count-up, count-down, Pomodoro, custom protocol) are unified as an ordered list of "blocks," and Flowtime/Deep Work/52-17 are just preset protocols. Exactly one timer is active at a time; interrupted running sessions are recovered deterministically on restart.

## Decisions

- Single source of truth is the Rust backend EngineService (Mutex<EngineState>); it is the ONLY writer to SQLite. React/Zustand is a read cache hydrated via Tauri broadcast events.
- Timestamp-based timing: store startedAt/runningSinceUtc + accumulatedMs; derive elapsed = accumulatedMs + (now - runningSinceUtc). Never accumulate via setInterval counting.
- Two-clock rule: monotonic (Instant / performance.now) for LIVE elapsed math; UTC epoch-ms wall clock persisted for history, calendar, analytics, and cross-restart recovery.
- Persist on every state transition + a 15s heartbeat; never persist at tick frequency. SQLite in WAL mode, synchronous=NORMAL.
- 'break' is not a top-level state; it is a running block whose kind is break/longBreak. Top-level states: idle, running, paused, completed(+abandoned).
- All modes are represented as one ordered Protocol (Block[]) where durationMs=null means open-ended count-up. count-up/count-down/pomodoro/custom are all block lists.
- Flowtime/Deep Work/52-17 are pure config preset builders (buildProtocol) producing Block[]; no dedicated engine code paths.
- Exactly one live Session (status running|paused) app-wide, enforced by a partial UNIQUE index in SQLite AND the single Mutex. start() while active rejects with EngineError::AlreadyActive by default.
- Crash recovery: read the single active session; paused => restore as-is; running => credit clamped gap (<=5min) from heartbeat, restore to PAUSED if gap<=90s else finalize as completed. Never auto-resume without user consent; never inflate time.
- Backward clock / DST handled by clamping live elapsed to >=0 and recovery gap to >=0.
- Authoritative 1 Hz tick lives ONCE in Rust; each window runs a display-only rAF/1s loop deriving elapsed from the same broadcast anchor => no drift, no double count.
- Idle handling is light: OS GetLastInputInfo, prompt after 8min in focus, default action = keep; discard subtracts the idle interval. No auto-pause.
- Session + Segments model: accumulatedMs on session is authoritative; segments are the audit trail per resume/block.
- After a WebView2 reload the UI rehydrates via a get_engine_state command; the Rust timer never stopped.

## timer-engine — Crash-safe Timer + Session Engine

### 0. Architectural stance (decisions up front)

- **Single source of truth lives in the Rust backend**, not React. The Rust `EngineService` owns the authoritative session state and is the only writer to SQLite. React/Zustand is a *cache* of engine state that is refreshed via Tauri events. This is the one decision everything else follows from: with two windows (main + floating) plus system sleep and possible WebView2 reloads, the WebView is too volatile to be the owner. Rust is the process that stays alive.
- **Time is always wall-clock derived.** We never accumulate elapsed by counting `setInterval` ticks. We store an anchor (`startedAt`) plus already-banked `accumulatedMs`, and *compute* `elapsedMs = accumulatedMs + (now - startedAt)` whenever we need it. Ticks exist only to trigger recomputation for display; a dropped, delayed, or fired-late tick changes nothing about the stored truth.
- **Persist on transition, not on tick.** SQLite is written on every state transition (start/pause/resume/block-advance/complete) and on a low-frequency heartbeat, never at 60fps. This keeps I/O trivial and the DB always consistent enough to recover from.

### (b) WHY timestamp-based (the core invariant)

A naive timer does `elapsed += 1` every second inside `setInterval`. This is broken for a desktop app on four independent axes, and all four are real on Windows 11:

1. **Process death / crash / OS restart.** An in-memory counter is gone. A timestamp survives because it was written to disk. On restart we read `startedAt` and reconstruct elapsed from the current clock.
2. **Sleep / hibernate / WebView2 throttling.** When the laptop lid closes or the app is backgrounded, timers/rAF are throttled or frozen. A counting timer *loses those minutes*; a wall-clock timer simply reads a larger `now - startedAt` when it wakes and is instantly correct. This is the single most common way naive timers silently under-count.
3. **DST / clock adjustments.** This is why we store **two clocks**: a *monotonic* clock for elapsed math and a *UTC wall clock* for display/history.
4. **Tick jitter.** `setInterval(…, 1000)` drifts; over an hour it can be seconds off. Deriving from timestamps has zero accumulated drift.

**Two-clock rule (decisive):**
- **Elapsed duration** is computed from a **monotonic** source (`std::time::Instant` in Rust; `performance.now()` in JS for the display-only fallback). Monotonic clocks never jump backward and are immune to DST and NTP corrections. This guarantees elapsed never goes negative or leaps.
- **Wall-clock timestamps** (`started_at_utc`, `ended_at_utc`) are stored in **UTC epoch milliseconds** for the permanent history, calendar bucketing, and analytics. Never store local time; convert to local only at render.

The subtlety across a crash: after a restart there is *no shared monotonic origin* with the pre-crash process (monotonic clocks reset per boot/process). So for **recovery math we fall back to the persisted UTC wall clock**: `recoveredElapsed = accumulatedMs + (nowUtc - lastKnownRunningAnchorUtc)`, but **clamped** (see recovery below) so a backward clock change or a huge sleep gap can't produce absurd values. During a *live* run we prefer monotonic; across a *restart* we use the persisted UTC anchor with clamping. This split is the whole trick.

### (a) State machine + data flow

States: `idle → running ⇄ paused → completed`, with `break` modeled as "running a block whose kind is `break`" rather than a separate top-level state (keeps the machine small and makes Pomodoro/protocol uniform).

```
        start()                pause()
 idle ──────────► running ──────────────► paused
   ▲                 │  ▲                    │
   │        complete/│  │ resume()           │
   │        skip past│  └────────────────────┘
   │        last block│
   │                 ▼
   └──────────── completed  ──(reset/new)──► idle
                     ▲
        abandon()────┘   (interrupted sessions resolved to completed|abandoned)
```

Transitions and their effects:

| From | Event | To | Anchor / accumulated effect | Persist |
|------|-------|----|----|--------|
| idle | `start(config)` | running | `startedAt = now`; `accumulatedMs = 0`; create Session row (`status=running`), create first Segment | yes |
| running | `pause()` | paused | `accumulatedMs += now - startedAt`; `startedAt = null`; close current Segment | yes |
| paused | `resume()` | running | `startedAt = now`; open new Segment | yes |
| running | block boundary reached (count-down/pomodoro/protocol) | running (next block) | bank block elapsed; advance `blockIndex`; new Segment; fire `block:complete` | yes |
| running/paused | `stop()` / last block done | completed | bank elapsed; `endedAt = now`; `status=completed`; close Segment | yes |
| any active | `abandon()` | completed(status=`abandoned`) | bank elapsed; mark abandoned | yes |
| running | heartbeat (e.g. every 15s) | running | update `accumulatedMs` snapshot in row (idempotent) | yes (cheap upsert) |

Data flow (one direction for truth, one for commands):

```
UI (main window)         UI (floating window)
   │  invoke commands          │  invoke commands
   └──────────┬────────────────┘
              ▼  Tauri command (start/pause/resume/skip/stop)
     ┌───────────────────────┐
     │  Rust EngineService    │  ← single authoritative state (Mutex<EngineState>)
     │  - state machine       │
     │  - tick task (1 Hz)    │──── emits `engine:state` event (throttled) ──┐
     │  - recovery on boot    │                                              │
     └──────────┬─────────────┘                                             │
                ▼ SessionRepository (Drizzle-mirrored schema, written by Rust) 
             SQLite file  ◄─── WAL mode, synchronous=NORMAL                  │
                                                                            ▼
                                                 Zustand store subscribes, updates both windows
```

### (c) Session lifecycle: create / update / persist / recover

**Model choice: Session + Segments.** A `Session` is the whole activity; `Segments` are contiguous running intervals (a new segment each resume / block change). Elapsed is authoritative as `accumulatedMs` on the session, but segments give us (1) an audit trail, (2) the ability to recompute if `accumulatedMs` is ever suspect, and (3) per-block analytics. On pause we *bank* the running segment's duration into `accumulatedMs` so the session row alone is enough to recover; segments are corroborating detail.

- **Create:** on `start()`, insert Session (`status=running`, `startedAtUtc`, `mode`, serialized `protocol`, `blockIndex=0`, `accumulatedMs=0`, `heartbeatAtUtc=now`). Insert first open Segment.
- **Update:** each transition updates the Session row and the current Segment. Additionally a **heartbeat** every 15s writes `heartbeatAtUtc = now` and the current `accumulatedMs` snapshot (running segment's banked-so-far). The heartbeat is what makes crash recovery *accurate* instead of just *safe*.
- **Persist guarantees:** SQLite in **WAL mode**, `synchronous=NORMAL`. Transitions wrapped in a transaction. Worst case on a hard crash we lose < heartbeat interval of the *running* segment, and recovery clamps to the heartbeat anyway (below).

**Recovery on restart (deterministic algorithm):**

On boot, `EngineService::recover()` queries `SELECT * FROM sessions WHERE status IN ('running','paused')` (there should be at most one such — enforced by the single-active rule).

- If the found session was **paused**: it's already safe — `accumulatedMs` is fully banked, `startedAt` is null. Restore it as `paused`. No time math needed. User can resume.
- If the found session was **running** (i.e. the app died mid-run): we must reconstruct elapsed without trusting an in-memory anchor.
  - Compute `gap = nowUtc - heartbeatAtUtc`.
  - **Clamp gap** to `IDLE_MAX_RECOVERABLE_MS` (config, default 5 min). Rationale: if the machine was asleep/off for hours, we do NOT credit hours of focus time — that would corrupt analytics. We credit up to the clamp, everything beyond is treated as the session having ended.
  - If `gap <= RECOVERY_LIVE_THRESHOLD` (e.g. ≤ 90s — a genuine crash, not a long absence): restore as **paused** with `accumulatedMs = row.accumulatedMs + clamp(gap)`, and surface a non-blocking toast "Recovered session — resume?". We restore to *paused*, never silently *running*, so the user consciously reengages (respects "did you actually keep working?").
  - If `gap > RECOVERY_LIVE_THRESHOLD`: the app was gone long enough that continuing is meaningless. Finalize the session: `accumulatedMs += clamp(gap up to threshold)`, `status = 'completed'` (flag `wasRecovered=true`, `endedAtUtc = heartbeatAtUtc + clamp`). It lands in history honestly. No data loss, no inflated numbers.
  - If clock moved **backward** (`nowUtc < heartbeatAtUtc`): gap is negative → clamp to 0, restore as paused. DST/NTP safe.

This gives the three guarantees that matter: **no lost sessions** (always recorded), **no inflated time** (clamped), **no auto-resume without consent** (restored to paused).

### (d) Modes as a unified block list

Everything is an ordered list of **blocks**. A block has a `kind` (`focus | break | longBreak`) and a `durationMs | null` (null = open-ended / count-up).

- **Count-up (Flowtime-ish base):** one block `{kind:focus, durationMs:null}`. Runs until user stops. Elapsed counts up.
- **Count-down:** one block `{kind:focus, durationMs: X}`. When `elapsed >= X` → block complete → (no next block) → session completed; fire notification.
- **Pomodoro:** generated from `{focusMs, breakMs, longBreakMs, cyclesBeforeLongBreak, totalCycles}` into an expanded block list: `focus, break, focus, break, …, focus, longBreak, …`. Modeling as an explicit expanded list (rather than modular arithmetic) makes "skip break", "jump to block", and progress display trivial and makes persistence self-describing.
- **Custom protocol:** the block list *is* the user's authored ordered list — the general case Pomodoro is a special preset of.

**Study methods map onto these as presets (no new engine code):**

| Method | Maps to | Definition |
|--------|---------|-----------|
| **Flowtime** | count-up focus, then a *derived* break | one open focus block; on stop, engine suggests a break block sized by a rule (e.g. break = focusMs / 5, capped). Modeled as a 2-block protocol where block 2's duration is computed at block-1 completion. |
| **Deep Work** | count-down single long focus | one `{focus, durationMs: 90m}` block (configurable), Do-Not-Disturb hint on. |
| **52/17** | Pomodoro preset | `{focusMs:52m, breakMs:17m, cyclesBeforeLongBreak:∞, totalCycles:n}` → alternating 52/17 blocks. |
| **Deep Work stacks / custom** | custom protocol | authored block list. |

The engine only knows blocks; presets are pure data builders in the config layer (`buildProtocol(method, params) → Block[]`). This is the "no magic values / centralized config" principle honored directly.

Block advancement (count-down/pomodoro/protocol): the tick compares derived block-elapsed to `block.durationMs`; on crossing, engine banks the block, increments `blockIndex`, opens next segment, emits `block:complete` (drives notification + auto-start-next per config). If `blockIndex` past end → `completed`.

### (e) Multiple timers, exactly one active

- Timers are **configurations/presets** (name, mode, protocol, color) persisted in a `timers` table. A *Session* is a run of a timer. You can have many timer presets; you can only have **one live Session** (`status in running|paused`) at a time — this is the natural focus constraint of a single-user productivity app and simplifies recovery (one row to find).
- Enforcement lives in Rust: `start(timerId)` checks the current EngineState. If a session is active, it either **rejects** (default) or, per config `onStartWhileActive`, auto-pauses/finalizes the current one first. Default = reject with a typed error `EngineError::AlreadyActive`, UI prompts "Stop current session?". No partial concurrent state is ever possible because the single `Mutex<EngineState>` physically permits only one.

### (f) Light idle handling

Intentionally *light* (this is a personal app, not surveillance):
- Rust reads OS **last-input time** (`GetLastInputInfo` on Windows) inside the tick, only while `running`.
- If idle for `> IDLE_PROMPT_MS` (config, default 8 min) during a `focus` block: emit `engine:idle-detected` with the idle-start timestamp. The UI shows a gentle non-blocking prompt: "Away for N min — keep, discard idle time, or pause?" We do **not** auto-pause (that surprises people). Default action if ignored = keep (Flowtime philosophy).
- If the user chooses "discard": engine subtracts the idle interval from `accumulatedMs` (it has the idle start/end from `GetLastInputInfo`), banking honest focus time. Same clamping discipline as recovery.
- Sleep is *not* idle-handling's job — it's handled by wall-clock derivation + heartbeat gap (already correct).

### (g) Floating window live state — where the tick lives

- **The authoritative tick lives once, in Rust** (`tokio::time::interval(1s)` while a session is `running`). It (a) recomputes derived elapsed, (b) checks block boundaries + idle, (c) emits a throttled `engine:state` event (~1 Hz; the payload carries `startedAtUtc`, `accumulatedMs`, `blockIndex`, `status`, not a pre-rendered string). Only one tick for the whole app → no drift between windows, no double counting.
- **Each window renders from timestamps locally.** The floating window (and main window) subscribe to `engine:state`, store the anchor in Zustand, and run a *display-only* `requestAnimationFrame`/1s loop that computes `elapsed = accumulatedMs + (Date.now() - startedAtUtc)` for the numbers on screen. Because both windows compute from the same anchor, they are always in sync; if a rAF is throttled (backgrounded floating window), the next frame is instantly correct — no accumulation, so no drift.
- **State propagation:** commands go UI→Rust via `invoke`; truth goes Rust→all-windows via `emit` (broadcast to every WebView). Zustand holds `{status, mode, protocol, blockIndex, startedAtUtc, accumulatedMs, activeSessionId}`. Presentation components read *derived* selectors (`useDerivedElapsed()`), never store elapsed as state → no re-render storm, no logic in components (honors the separation principle: engine=logic, Rust repo=persistence, Zustand=cache, React=presentation).
- Floating window is a separate Tauri `WebviewWindow` (`alwaysOnTop`, transparent, `decorations:false`); it shares the same Zustand store hydrated from the same events, so compact/mini states are pure view concerns over identical data.

### Persistence schema (Drizzle) — see code sketches
Tables: `timers` (presets), `sessions` (the run + banked elapsed + recovery anchor), `session_segments` (audit intervals). Times as `integer` epoch-ms UTC. `status` as text enum. Exactly-one-active enforced by a partial unique index.

### Failure-mode summary (production-minded)
- Hard crash mid-run → recovered, clamped, restored to paused (or finalized if long gap). No loss, no inflation.
- Laptop sleep 3h mid-run → gap clamped to 5 min, session finalized honestly in history.
- Clock/DST backward jump → monotonic for live math, clamp≥0 for recovery. No negative elapsed.
- WebView2 reload/crash (Rust alive) → UI re-subscribes on mount, rehydrates from `get_engine_state` command; timer never stopped.
- Two windows open → one Rust tick, both derive from same anchor → always identical.

## Code Sketches

```typescript
// ─────────────────────────────────────────────────────────────
// features/timer/config/constants.ts  — centralized, no magic values
// ─────────────────────────────────────────────────────────────
export const ENGINE_TICK_MS = 1_000;              // authoritative tick (Rust mirrors)
export const HEARTBEAT_MS = 15_000;               // DB snapshot cadence while running
export const RECOVERY_LIVE_THRESHOLD_MS = 90_000; // gap under this => restore as paused
export const IDLE_MAX_RECOVERABLE_MS = 5 * 60_000;// clamp for crash/sleep credit
export const IDLE_PROMPT_MS = 8 * 60_000;         // idle prompt threshold (focus only)

// ─────────────────────────────────────────────────────────────
// features/timer/domain/types.ts
// ─────────────────────────────────────────────────────────────
export type SessionStatus =
  | 'running' | 'paused' | 'completed' | 'abandoned';

export type BlockKind = 'focus' | 'break' | 'longBreak';
export type TimerMode = 'countUp' | 'countDown' | 'pomodoro' | 'protocol';

/** A single timed step. durationMs === null => open-ended (count-up). */
export interface Block {
  readonly id: string;
  readonly kind: BlockKind;
  readonly durationMs: number | null;
  readonly label?: string;
}

/** Ordered list is the universal representation of every mode. */
export type Protocol = readonly Block[];

/** A saved timer preset (many can exist). */
export interface TimerPreset {
  readonly id: string;
  readonly name: string;
  readonly mode: TimerMode;
  readonly protocol: Protocol;   // serialized to JSON in `timers.protocolJson`
  readonly colorHex: string;
  readonly createdAtUtc: number;
}

/** The permanent, recoverable Session record (mirrors the sessions row). */
export interface Session {
  readonly id: string;
  readonly timerId: string;
  readonly mode: TimerMode;
  readonly protocol: Protocol;        // frozen copy at start time
  readonly status: SessionStatus;

  readonly startedAtUtc: number;      // wall-clock UTC ms, session origin
  readonly endedAtUtc: number | null;

  /** Banked elapsed across all completed segments (source of truth). */
  readonly accumulatedMs: number;
  /** Set only while running = origin of the *current* live segment (UTC ms). */
  readonly runningSinceUtc: number | null;

  readonly blockIndex: number;        // index into protocol
  readonly heartbeatAtUtc: number;    // last liveness write (recovery anchor)
  readonly wasRecovered: boolean;
}

export interface SessionSegment {
  readonly id: string;
  readonly sessionId: string;
  readonly blockIndex: number;
  readonly startedAtUtc: number;
  readonly endedAtUtc: number | null; // null => open segment
}

/** Event payload broadcast Rust -> all windows (~1 Hz). UI derives elapsed. */
export interface EngineStateSnapshot {
  readonly status: SessionStatus | 'idle';
  readonly session: Session | null;
  readonly serverNowUtc: number;      // for clock-skew correction if ever needed
}

// ─────────────────────────────────────────────────────────────
// Pure derivation — the ONE elapsed formula, used everywhere
// ─────────────────────────────────────────────────────────────
export function deriveElapsedMs(s: Session, nowUtc: number): number {
  const live = s.runningSinceUtc !== null
    ? Math.max(0, nowUtc - s.runningSinceUtc)  // clamp >=0 (DST safe)
    : 0;
  return s.accumulatedMs + live;
}

export function deriveBlockRemainingMs(s: Session, nowUtc: number): number | null {
  const block = s.protocol[s.blockIndex];
  if (!block || block.durationMs === null) return null;  // count-up
  const blockElapsed = deriveElapsedMs(s, nowUtc) - blockBankedBefore(s);
  return Math.max(0, block.durationMs - blockElapsed);
}
// blockBankedBefore(): sum of prior blocks' durations; impl omitted for brevity.

// ─────────────────────────────────────────────────────────────
// features/timer/domain/protocolBuilders.ts — presets => Protocol
// ─────────────────────────────────────────────────────────────
export const buildPomodoro = (p: {
  focusMs: number; breakMs: number; longBreakMs: number;
  cyclesBeforeLong: number; totalCycles: number;
}): Protocol => { /* expand alternating focus/break/longBreak blocks */ };

export const buildDeepWork = (durationMs = 90 * 60_000): Protocol =>
  [{ id: crypto.randomUUID(), kind: 'focus', durationMs }];

export const buildFiftyTwoSeventeen = (cycles: number): Protocol =>
  buildPomodoro({ focusMs: 52*60_000, breakMs: 17*60_000,
                  longBreakMs: 17*60_000, cyclesBeforeLong: cycles, totalCycles: cycles });

export const buildFlowtime = (): Protocol =>
  [{ id: crypto.randomUUID(), kind: 'focus', durationMs: null }]; // break added on stop

// ─────────────────────────────────────────────────────────────
// features/timer/service/engineService.ts
// Thin TS facade over Tauri commands. NO timing math done here beyond
// display derivation; Rust is authoritative. Components never call invoke directly.
// ─────────────────────────────────────────────────────────────
export interface EngineService {
  start(timerId: string): Promise<Session>;         // throws AlreadyActive if one live
  pause(): Promise<Session>;
  resume(): Promise<Session>;
  skipBlock(): Promise<Session>;                     // advance blockIndex
  stop(): Promise<Session>;                          // finalize -> completed
  abandon(): Promise<Session>;                       // finalize -> abandoned
  getState(): Promise<EngineStateSnapshot>;          // rehydrate after WebView reload
  resolveIdle(choice: 'keep' | 'discard' | 'pause', idleStartUtc: number): Promise<Session>;
  /** Subscribe to authoritative broadcasts (start/pause/tick/block/idle/recovered). */
  onState(cb: (snap: EngineStateSnapshot) => void): UnlistenFn;
  onEvent(cb: (e: EngineEvent) => void): UnlistenFn;
}

export type EngineEvent =
  | { type: 'block:complete'; blockIndex: number; kind: BlockKind }
  | { type: 'session:completed'; sessionId: string }
  | { type: 'idle:detected'; idleStartUtc: number }
  | { type: 'session:recovered'; session: Session };

// ─────────────────────────────────────────────────────────────
// Drizzle schema — features/timer/persistence/schema.ts
// Times = epoch ms UTC (integer). Written by Rust repo mirroring this shape.
// ─────────────────────────────────────────────────────────────
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const timers = sqliteTable('timers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mode: text('mode').$type<TimerMode>().notNull(),
  protocolJson: text('protocol_json').notNull(),
  colorHex: text('color_hex').notNull(),
  createdAtUtc: integer('created_at_utc').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  timerId: text('timer_id').notNull().references(() => timers.id),
  mode: text('mode').$type<TimerMode>().notNull(),
  protocolJson: text('protocol_json').notNull(),   // frozen copy at start
  status: text('status').$type<SessionStatus>().notNull(),
  startedAtUtc: integer('started_at_utc').notNull(),
  endedAtUtc: integer('ended_at_utc'),
  accumulatedMs: integer('accumulated_ms').notNull().default(0),
  runningSinceUtc: integer('running_since_utc'),    // null unless running
  blockIndex: integer('block_index').notNull().default(0),
  heartbeatAtUtc: integer('heartbeat_at_utc').notNull(),
  wasRecovered: integer('was_recovered', { mode: 'boolean' }).notNull().default(false),
}, (t) => ({
  // Exactly one live session app-wide: partial unique index on the "active" flag.
  oneActive: uniqueIndex('ux_one_active')
    .on(t.status).where(sql`status IN ('running','paused')`),
}));

export const sessionSegments = sqliteTable('session_segments', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  blockIndex: integer('block_index').notNull(),
  startedAtUtc: integer('started_at_utc').notNull(),
  endedAtUtc: integer('ended_at_utc'),
});
```

```rust
// src-tauri/src/engine/mod.rs  — authoritative owner (sketch)
pub struct EngineService {
    state: Mutex<EngineState>,     // Idle | Active(Session)
    repo:  SessionRepository,      // WAL sqlite writer
    app:   AppHandle,              // for emit to all windows
}

impl EngineService {
    // On app boot. Deterministic, clamped, consent-preserving.
    pub fn recover(&self) -> Result<(), EngineError> {
        let Some(mut s) = self.repo.find_active()? else { return Ok(()); };
        if s.status == Status::Paused { self.restore_paused(s); return Ok(()); }
        // status == Running: app died mid-run.
        let now = now_utc_ms();
        let gap = (now - s.heartbeat_at_utc).max(0);          // DST/backward -> 0
        let credited = gap.min(IDLE_MAX_RECOVERABLE_MS);
        s.accumulated_ms += credited;
        if gap <= RECOVERY_LIVE_THRESHOLD_MS {
            s.status = Status::Paused; s.running_since_utc = None; s.was_recovered = true;
            self.repo.upsert(&s)?;
            self.emit_event(EngineEvent::Recovered(s.clone()));
        } else {
            s.status = Status::Completed;
            s.ended_at_utc = Some(s.heartbeat_at_utc + credited);
            s.was_recovered = true; s.running_since_utc = None;
            self.repo.upsert(&s)?;               // lands honestly in history
        }
        Ok(())
    }

    // 1 Hz while running: derive, check boundaries+idle, heartbeat, broadcast.
    fn tick(&self) {
        let mut g = self.state.lock().unwrap();
        let EngineState::Active(ref mut s) = *g else { return };
        if s.status != Status::Running { return; }
        let now = now_utc_ms();
        // block boundary?
        if let Some(rem) = derive_block_remaining_ms(s, now) {
            if rem == 0 { self.advance_block(s, now); }        // banks + new segment
        }
        // idle (focus only) via GetLastInputInfo
        if current_block_kind(s) == BlockKind::Focus {
            if let Some(idle_ms) = os_idle_ms() {
                if idle_ms > IDLE_PROMPT_MS {
                    self.emit_event(EngineEvent::IdleDetected { idle_start_utc: now - idle_ms });
                }
            }
        }
        // heartbeat throttle
        if now - s.heartbeat_at_utc >= HEARTBEAT_MS {
            s.heartbeat_at_utc = now; self.repo.heartbeat(s);  // cheap upsert
        }
        self.broadcast(s, now);   // emit engine:state to ALL windows
    }
}
```

```rust
// Tauri window config (conceptual) — floating always-on-top
WebviewWindowBuilder::new(app, "floating", url)
    .always_on_top(true).transparent(true).decorations(false)
    .skip_taskbar(true).inner_size(220.0, 90.0);
// Same Zustand store hydrates from the same broadcast events => zero drift.
```

## Risks

- Broadcasting engine:state at 1 Hz to multiple windows is cheap, but emitting the full Session object each tick could churn Zustand; mitigate by only storing the anchor and deriving elapsed in a selector, and only re-emitting full state on transitions (tick emits a lightweight {nowUtc} or is skipped in favor of pure client derivation).
- GetLastInputInfo returns system-wide idle, not app-specific; user working in another app during a focus block reads as idle. Accept for MVP (light idle handling), documented; the 'keep' default avoids penalizing.
- The 5-minute recovery clamp is a policy choice; too small under-credits a genuine brief crash, too large risks inflation after sleep. Value is centralized in config for tuning.
- Partial unique index syntax must match SQLite/Drizzle capabilities; if Drizzle can't express the WHERE clause cleanly, enforce single-active in Rust + a raw migration for the index.
- Monotonic clock has no shared origin across process restarts, so recovery MUST use the persisted UTC heartbeat, not monotonic. Mixing them up would reintroduce the bug we are avoiding — call it out explicitly in implementation review.
- WebView2 rAF throttling when the floating window is occluded can make the displayed seconds lag; because display is derived from timestamps the next visible frame corrects instantly, but expect brief visual stalls, not data errors.

## Open Questions

- Flowtime auto-break sizing rule: confirm the exact formula (proposed break = min(focusMs/5, cap)). Needs a product decision on the divisor and cap.
- On start() while a session is active: default is reject-and-prompt; confirm whether any preset (e.g. switching timers quickly) should instead auto-finalize the current session per a config flag onStartWhileActive.
- Break blocks and idle/analytics: should break time count toward 'study hours' analytics or be excluded? (Proposed: exclude break/longBreak from study-hours totals but keep in history.)
- Notification behavior on block:complete when the app window is closed to tray — native notification always, plus optional sound; confirm defaults with the notifications/tray slice owner.
- Whether count-down/pomodoro should auto-advance into the next block or wait for user acknowledgement (proposed: auto-advance focus->break, require tap to start next focus; make it a config toggle).

