# Design: frontend-arch

> A lean, feature-based React/TypeScript frontend for a single-user Tauri desktop app. Four Zustand stores (timer, tasks, settings, ui) with selective persistence, a strict component → hook → service → Drizzle/Tauri data-access boundary that keeps all business logic out of components, and React Router routes for the main window plus a dedicated floating-timer route. The two windows share ONE canonical state via SQLite-as-source-of-truth plus Tauri events for live broadcast — the timer engine runs in Rust, so both windows are thin renderers of authoritative backend state.

## Decisions

- Single Vite bundle for both windows; React Router URL (`/` vs `/float`) selects the view. No second build.
- Timer truth lives in Rust; React windows are pure renderers of Rust-emitted `timer://tick` snapshots. No React-owned setInterval.
- Cross-window live state = SQLite (durable/crash-safe) + Tauri `app.emit` events (live). Do NOT build a JS-side IPC broadcast — separate WebView2 heaps make Zustand non-shareable anyway.
- Four Zustand stores: timer (not persisted, SQLite-truth), tasks (not persisted, SQLite-truth), settings+theme (persist->localStorage), ui (persist->localStorage).
- Strict layering: component -> hook -> service -> repository(Drizzle)/tauri wrapper. Enforced by ESLint no-restricted-imports banning db/services/@tauri-apps from components.
- Services return Result<T, AppError>; hooks handle optimistic update + rollback; components have zero logic.
- All event names, command names, routes, storage keys, and durations centralized in src/config/*.ts as `as const`. theme.config.ts is the single source for both Tailwind and JS.
- UI commands are fire-and-forget: buttons call invoke() and wait for the resulting event to update state, guaranteeing both windows stay identical.
- Feature-based folder layout with per-feature components/hooks/services/types; db/repositories shared under db/ (not per-feature); dark-first theme default.

## Frontend Architecture — ProductivityOS

### Guiding decisions (locked)

1. **Two windows, one React bundle.** The main window and the floating timer are separate Tauri windows but the *same* Vite build. React Router picks what renders based on the URL the window opens (`/` vs `/float`). This avoids a second build pipeline and lets both windows share the exact same stores, services, and design tokens.

2. **The timer engine lives in Rust, not React.** Tick counting, elapsed-time math, and crash-safe persistence are backend concerns (this is decided in the timer-engine slice). React *never* runs a `setInterval` that owns truth. React subscribes to Rust-emitted events and renders. This is the single most important architectural choice: it makes the floating window and main window trivially consistent, and it survives WebView2 throttling background windows.

3. **Business logic is banned from components.** Components import hooks. Hooks call services and read stores. Services call Drizzle (data) or Tauri `invoke`/events (backend). No component ever imports `db`, `invoke`, or Drizzle. This is enforceable by an ESLint `no-restricted-imports` rule.

---

### (a) Folder structure under `src/`

Feature-based, flat, no premature abstraction. Each feature owns its components/hooks/services/types. Truly cross-cutting things live in top-level `shared/`, `stores/`, `services/`, `config/`, `db/`.

```
src/
  main.tsx                      # entry: mounts <App/>, decides window role
  App.tsx                       # <RouterProvider/> + global providers (theme)
  router.tsx                    # route table (see section c)

  windows/
    MainWindow.tsx              # layout shell for main window (sidebar + <Outlet/>)
    FloatWindow.tsx             # layout shell for floating timer (transparent, drag)

  features/
    timer/
      components/
        TimerDisplay.tsx
        TimerControls.tsx
        MethodPicker.tsx        # Pomodoro / Flowtime / DeepWork / 52-17 / custom
        FloatingTimer.tsx       # the compact+mini floating UI
      hooks/
        useTimer.ts             # reads timerStore, calls timerService
        useTimerEvents.ts       # subscribes to Rust events -> updates store
      services/
        timer.service.ts        # invoke() wrappers: start/pause/stop/skip
        method.service.ts       # protocol logic (phase sequences, durations)
      types.ts

    sessions/                   # permanent session history
      components/SessionList.tsx
      hooks/useSessions.ts
      services/session.service.ts
      types.ts

    tasks/
      components/
        TaskItem.tsx
        TaskList.tsx
        TaskComposer.tsx
      hooks/
        useTasks.ts
        useTaskHistory.ts
      services/task.service.ts
      types.ts

    calendar/
      components/CalendarGrid.tsx  # monthly, color-coded per day
      hooks/useCalendar.ts
      services/calendar.service.ts # aggregates task status -> day color
      types.ts

    streaks/
      components/StreakBadge.tsx
      hooks/useStreaks.ts
      services/streak.service.ts   # streak calc + restore logic
      types.ts

    notes/
      components/NoteEditor.tsx    # markdown, autosave
      hooks/useDailyNote.ts
      services/note.service.ts
      types.ts

    analytics/
      components/StudyHoursChart.tsx
      components/CompletionChart.tsx
      hooks/useAnalytics.ts
      services/analytics.service.ts
      types.ts

    settings/
      components/SettingsPanel.tsx
      hooks/useSettings.ts         # thin wrapper over settingsStore
      types.ts

  stores/
    timer.store.ts
    tasks.store.ts
    settings.store.ts             # includes theme
    ui.store.ts
    index.ts                      # re-exports

  services/                       # cross-cutting, feature-agnostic
    tauri.ts                      # typed invoke() + event listen() wrappers
    notifications.service.ts      # native desktop notifications
    tray.service.ts               # system tray interactions
    window.service.ts             # open/close/move floating window

  db/
    client.ts                     # Drizzle client bound to SQLite
    schema.ts                     # Drizzle table defs (owned by db slice)
    repositories/                 # low-level CRUD; services compose these
      tasks.repo.ts
      sessions.repo.ts
      notes.repo.ts
      settings.repo.ts

  shared/
    components/
      Button.tsx
      Card.tsx
      Modal.tsx
      Icon.tsx                    # wraps lucide-react
      EmptyState.tsx
    hooks/
      useDebounce.ts
      useMediaMatch.ts
    lib/
      date.ts                     # day-key helpers (local-tz safe)
      format.ts                   # duration/percent formatting
      result.ts                   # Result<T,E> helper for services
    types/
      common.ts                   # DayKey, ISODate, Result branded types

  config/
    app.config.ts                 # app-wide constants
    timer.config.ts               # method presets, default durations
    theme.config.ts               # design tokens (colors, spacing) as TS
    events.config.ts              # Tauri event name constants
    routes.config.ts              # route path constants

  styles/
    globals.css                   # Tailwind directives + base
```

**Why this shape:** one developer, so no `packages/`, no barrel-per-folder ceremony, no `domain/` layer. A feature folder is self-contained enough to open one directory and see the whole vertical slice. `repositories/` sits under `db/` (not per-feature) because Drizzle schema is one file and repos are thin; splitting them per-feature would scatter transactions.

---

### (b) Zustand store split

Four stores. Each store holds **only live UI-relevant state**; the durable source of truth is SQLite. Stores are hydrated from services on mount and kept in sync (timer via events, others via optimistic updates + reconcile).

**Persistence policy:**
- `settings.store` and `ui.store` → **`persist` middleware** to `localStorage` (small, UI-only, fine to lose SQLite round-trip for instant startup / no flash).
- `timer.store` and `tasks.store` → **NOT persisted to localStorage.** Their truth is SQLite (crash-safe, queried on boot). Persisting them to localStorage would create two sources of truth and stale-state bugs. They hydrate from services at startup.

| Store | Persist? | Purpose |
|---|---|---|
| `timer.store` | no (SQLite is truth) | mirror of active session emitted by Rust |
| `tasks.store` | no (SQLite is truth) | today's pending/completed lists |
| `settings.store` | yes (localStorage) | theme, opacity, method defaults, notifications on/off |
| `ui.store` | yes (localStorage) | floating window mode, sidebar collapsed, active modal |

```ts
// src/stores/timer.store.ts
import { create } from 'zustand';
import type { TimerSnapshot } from '@/features/timer/types';

interface TimerState {
  snapshot: TimerSnapshot | null;   // authoritative state from Rust
  isHydrated: boolean;
  // setters are called ONLY by useTimerEvents (event -> store), never by components
  setSnapshot: (s: TimerSnapshot) => void;
  clear: () => void;
}

export const useTimerStore = create<TimerState>((set) => ({
  snapshot: null,
  isHydrated: false,
  setSnapshot: (snapshot) => set({ snapshot, isHydrated: true }),
  clear: () => set({ snapshot: null }),
}));
```

```ts
// src/stores/settings.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/config/app.config';
import type { StudyMethodId } from '@/features/timer/types';

type Theme = 'dark' | 'light' | 'system';

interface SettingsState {
  theme: Theme;
  floatOpacity: number;            // 0.3 - 1.0
  defaultMethod: StudyMethodId;
  notificationsEnabled: boolean;
  setTheme: (t: Theme) => void;
  setFloatOpacity: (o: number) => void;
  setDefaultMethod: (m: StudyMethodId) => void;
  toggleNotifications: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',               // dark-first default
      floatOpacity: 0.9,
      defaultMethod: 'pomodoro',
      notificationsEnabled: true,
      setTheme: (theme) => set({ theme }),
      setFloatOpacity: (floatOpacity) => set({ floatOpacity }),
      setDefaultMethod: (defaultMethod) => set({ defaultMethod }),
      toggleNotifications: () =>
        set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
    }),
    { name: STORAGE_KEYS.settings, version: 1 },
  ),
);
```

`ui.store` (persisted): `{ floatMode: 'compact' | 'mini', sidebarCollapsed: boolean, activeModal: ModalId | null }` with matching setters. `tasks.store` (not persisted): `{ pending: Task[], completed: Task[], isLoading, setLists, applyOptimistic, reconcile }` — mutated only through `useTasks` after `task.service` confirms.

**Note on settings duplication:** settings live in SQLite too (for analytics/backup), but the store persists to localStorage for zero-flash startup and writes through to SQLite via `settings.service` on change. localStorage is the read path at boot; SQLite is the durable/portable copy.

---

### (c) Routing (React Router v6, `createBrowserRouter`)

Two window shells, each with its own subtree. The floating window opens at `/float` (set as its `url` when the Tauri window is created).

```ts
// src/config/routes.config.ts
export const ROUTES = {
  home: '/',
  tasks: '/tasks',
  completed: '/tasks/completed',
  history: '/tasks/history',
  calendar: '/calendar',
  notes: '/notes',
  analytics: '/analytics',
  settings: '/settings',
  float: '/float',            // floating timer window
} as const;
```

Route table:
- `/` → MainWindow shell → **Dashboard** (today: active timer summary + pending tasks + streak)
- `/tasks` → pending tasks page
- `/tasks/completed` → completed-today page
- `/tasks/history` → task history
- `/calendar` → monthly color-coded calendar
- `/notes` → daily note editor (defaults to today)
- `/analytics` → charts (study hours, completion rate, streaks)
- `/settings` → settings page
- `/float` → **FloatWindow** shell → FloatingTimer (no sidebar, transparent, draggable)

The float route is *outside* the MainWindow layout (sibling, not child) so it inherits no sidebar/chrome.

---

### (d) Data-access boundary: component → hook → service → Drizzle/Tauri

Strict one-directional flow. Four layers:

1. **Component** — presentation only. Calls a hook, renders its return. No `invoke`, no `db`, no math.
2. **Hook** — binds store state to components, exposes intent functions (`addTask`, `start`). Orchestrates optimistic updates. Contains *view-orchestration* logic only.
3. **Service** — the business logic layer. Validation, method/phase computation, streak math, aggregation. Returns `Result<T, AppError>`. Calls repositories and Tauri.
4. **Repository (Drizzle) / Tauri wrapper** — pure I/O. Repos do CRUD; `tauri.ts` does typed `invoke`/`listen`.

Enforced by ESLint:
```json
// .eslintrc — inside overrides for features/**/components/**
{ "no-restricted-imports": ["error", {
    "patterns": [
      { "group": ["**/db/**", "**/services/**", "@tauri-apps/*"],
        "message": "Components must go through hooks, not services/db/tauri directly." }
    ]
}]}
```

Example vertical (tasks, with optimistic update):

```ts
// src/db/repositories/tasks.repo.ts  (pure I/O)
import { db } from '@/db/client';
import { tasks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const tasksRepo = {
  listByDay: (dayKey: string) =>
    db.select().from(tasks).where(eq(tasks.dayKey, dayKey)),
  insert: (row: NewTaskRow) => db.insert(tasks).values(row).returning(),
  setDone: (id: number, done: boolean) =>
    db.update(tasks).set({ done, completedAt: done ? Date.now() : null })
      .where(eq(tasks.id, id)).returning(),
};
```

```ts
// src/features/tasks/services/task.service.ts  (business logic)
import { tasksRepo } from '@/db/repositories/tasks.repo';
import { todayKey } from '@/shared/lib/date';
import { ok, err, type Result } from '@/shared/lib/result';
import type { Task } from '../types';

export const taskService = {
  async loadToday(): Promise<Result<{ pending: Task[]; completed: Task[] }>> {
    const rows = await tasksRepo.listByDay(todayKey());
    return ok({
      pending: rows.filter((r) => !r.done).map(toTask),
      completed: rows.filter((r) => r.done).map(toTask),
    });
  },
  async add(title: string): Promise<Result<Task>> {
    const clean = title.trim();
    if (!clean) return err({ code: 'EMPTY_TITLE' });
    const [row] = await tasksRepo.insert({ title: clean, dayKey: todayKey(), done: false });
    return ok(toTask(row));
  },
  toggle: async (id: number, done: boolean): Promise<Result<Task>> => {
    const [row] = await tasksRepo.setDone(id, done);
    return ok(toTask(row));
  },
};
```

```ts
// src/features/tasks/hooks/useTasks.ts  (orchestration; components import THIS)
import { useEffect, useCallback } from 'react';
import { useTasksStore } from '@/stores';
import { taskService } from '../services/task.service';

export function useTasks() {
  const { pending, completed, setLists, applyOptimistic, reconcile } = useTasksStore();

  useEffect(() => {
    taskService.loadToday().then((r) => { if (r.ok) setLists(r.value); });
  }, [setLists]);

  const addTask = useCallback(async (title: string) => {
    const r = await taskService.add(title);
    if (r.ok) reconcile();               // pull confirmed row into store
    return r;
  }, [reconcile]);

  const toggleTask = useCallback(async (id: number, done: boolean) => {
    applyOptimistic(id, done);           // instant UI
    const r = await taskService.toggle(id, done);
    if (!r.ok) applyOptimistic(id, !done); // rollback
  }, [applyOptimistic]);

  return { pending, completed, addTask, toggleTask };
}
```

The component (`TaskList.tsx`) just does `const { pending, toggleTask } = useTasks();` and maps. Zero logic.

---

### (e) Sharing live state between MAIN and FLOATING windows

**Recommendation: SQLite as source of truth + Tauri events for live broadcast. Do NOT build a JS-side IPC broadcast between windows.**

Rationale:
- Each Tauri window is a **separate WebView2 process with its own JS heap** — Zustand stores are NOT shared across windows. A store update in the main window is invisible to the float window. So you *must* have a cross-window channel regardless.
- The timer engine already runs in **Rust** (crash-safe requirement). Rust owns the tick loop and persists to SQLite every second/phase-change. Rust is the natural single broadcaster.
- Tauri's event system (`app.emit(...)`) delivers to **all windows** in one call. This is the lightweight IPC — we don't need to invent one. Both windows run `listen('timer://tick', …)` and feed their local `timer.store`.
- SQLite is the crash-recovery + history path; events are the live path. They are complementary, not competing: events for "now", SQLite for "what happened / recover after crash".

Flow:
```
[Rust timer loop]
   ├─ every tick ──> app.emit('timer://tick', snapshot) ─┬─> MainWindow  useTimerEvents -> timerStore
   │                                                       └─> FloatWindow useTimerEvents -> timerStore
   ├─ on phase change / stop ──> write session row to SQLite (crash-safe)
   └─ on app start ──> read unfinished session from SQLite -> emit 'timer://restored'

[Either window] user clicks Start/Pause
   └─ invoke('timer_start', {...}) ──> Rust mutates authoritative state ──> emits tick ──> BOTH windows update
```

Key point: **commands are fire-and-forget from the UI's perspective.** A button in the float window calls `invoke('timer_pause')`; it does NOT locally set paused state. It waits for the `timer://tick` event (now showing paused) to update its store. This guarantees both windows are always identical because they both render the same broadcast.

```ts
// src/features/timer/hooks/useTimerEvents.ts  (run once per window, in the shell)
import { useEffect } from 'react';
import { listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { useTimerStore } from '@/stores';
import type { TimerSnapshot } from '../types';

export function useTimerEvents() {
  const setSnapshot = useTimerStore((s) => s.setSnapshot);
  useEffect(() => {
    const unlisten = Promise.all([
      listen<TimerSnapshot>(EVENTS.timerTick, (p) => setSnapshot(p)),
      listen<TimerSnapshot>(EVENTS.timerRestored, (p) => setSnapshot(p)),
    ]);
    return () => { unlisten.then((us) => us.forEach((u) => u())); };
  }, [setSnapshot]);
}
```

Tasks/notes/calendar do NOT need live cross-window sync (only the main window shows them), so they stay simple SQLite reads. If a future need arises, the same event pattern extends (e.g. `tasks://changed`), but we do not build it now (YAGNI).

---

### (f) Config / constants strategy

All magic values live in `src/config/*.ts` as `as const` typed objects. No string literals for event names, routes, storage keys, or durations anywhere else. Design tokens live in `theme.config.ts` AND drive Tailwind via `tailwind.config` importing from it (single source for colors/spacing).

```ts
// src/config/timer.config.ts
export const STUDY_METHODS = {
  pomodoro:  { label: 'Pomodoro',  focusMin: 25, breakMin: 5,  longBreakMin: 15, cyclesToLong: 4 },
  fiftyTwo:  { label: '52 / 17',   focusMin: 52, breakMin: 17 },
  deepWork:  { label: 'Deep Work', focusMin: 90, breakMin: 20 },
  flowtime:  { label: 'Flowtime',  focusMin: null, breakMin: null }, // open-ended
} as const;

export const TIMER = { tickMs: 1000, minCustomMin: 1, maxCustomMin: 240 } as const;
export type StudyMethodId = keyof typeof STUDY_METHODS;
```

```ts
// src/config/events.config.ts   — the ONE place Tauri event names exist
export const EVENTS = {
  timerTick:     'timer://tick',
  timerRestored: 'timer://restored',
  timerFinished: 'timer://finished',
} as const;

// src/config/app.config.ts
export const STORAGE_KEYS = { settings: 'pos.settings.v1', ui: 'pos.ui.v1' } as const;
export const APP = { name: 'ProductivityOS', floatWindowLabel: 'float', startupBudgetMs: 2000 } as const;
```

Tauri command names get the same treatment in a `commands.config.ts` (`timer_start`, `timer_pause`, …) so the `tauri.ts` wrapper is the only file that touches raw command strings.

## Code Sketches

```ts
// src/services/tauri.ts — the ONLY file that imports @tauri-apps/api directly.
// Typed invoke + listen so services never touch raw strings.
import { invoke as rawInvoke } from '@tauri-apps/api/core';
import { listen as rawListen, type UnlistenFn } from '@tauri-apps/api/event';

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return rawInvoke<T>(cmd, args);
}
export function listen<T>(event: string, cb: (payload: T) => void): Promise<UnlistenFn> {
  return rawListen<T>(event, (e) => cb(e.payload));
}
```

```ts
// src/main.tsx — same bundle, both windows; router URL decides the view.
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
```

```tsx
// src/router.tsx — main shell + sibling float route (no shared chrome).
import { createBrowserRouter } from 'react-router-dom';
import { ROUTES } from '@/config/routes.config';
import { MainWindow } from '@/windows/MainWindow';
import { FloatWindow } from '@/windows/FloatWindow';
import { Dashboard } from '@/features/timer/components/Dashboard';
import { TasksPage } from '@/features/tasks/components/TaskList';
// ...other page imports

export const router = createBrowserRouter([
  { path: ROUTES.home, element: <MainWindow />, children: [
      { index: true, element: <Dashboard /> },
      { path: ROUTES.tasks, element: <TasksPage /> },
      { path: ROUTES.calendar, element: <CalendarPage /> },
      { path: ROUTES.notes, element: <NotesPage /> },
      { path: ROUTES.analytics, element: <AnalyticsPage /> },
      { path: ROUTES.settings, element: <SettingsPage /> },
  ]},
  { path: ROUTES.float, element: <FloatWindow /> }, // sibling: transparent, no sidebar
]);
```

```tsx
// src/windows/FloatWindow.tsx — mounts timer event listener + drag region.
import { useTimerEvents } from '@/features/timer/hooks/useTimerEvents';
import { FloatingTimer } from '@/features/timer/components/FloatingTimer';
import { useSettingsStore } from '@/stores';

export function FloatWindow() {
  useTimerEvents(); // subscribe this window to Rust broadcasts
  const opacity = useSettingsStore((s) => s.floatOpacity);
  return (
    <div data-tauri-drag-region className="h-screen bg-transparent" style={{ opacity }}>
      <FloatingTimer />
    </div>
  );
}
```

## Risks

- WebView2 throttles timers in background/hidden windows — mitigated by Rust owning the tick, but the float window's smooth countdown display still relies on event delivery; if events are throttled when hidden, the float may visually stutter (acceptable since it's usually visible/on-top).
- localStorage-persisted settings can drift from the SQLite mirror if a write fails; needs write-through with error handling in settings.service to avoid silent divergence.
- Optimistic task updates + reconcile can flicker if service latency is high; SQLite local reads are sub-ms so low risk, but the rollback path must be tested.
- ESLint import-boundary rule must be configured correctly or the layering erodes over time (the main safeguard against business logic creeping into components).

## Open Questions

- Exact TimerSnapshot shape (fields, phase enum) is owned by the timer-engine slice — this arch assumes { phase, remainingSec, elapsedSec, methodId, isRunning, sessionId }. Needs confirmation.
- Whether settings should be single-sourced in SQLite with localStorage as cache, or localStorage primary with SQLite mirror for backup — I chose localStorage-primary for zero-flash startup; confirm acceptable given a future export/backup feature.
- Drizzle schema field names (dayKey format, timestamp units) come from the db slice; repos above assume epoch-ms integers and a 'YYYY-MM-DD' local-tz dayKey.

