/**
 * Study-method presets + timer constants. Durations here are the UI-facing
 * defaults; the DB `study_methods` rows are the runtime source of truth
 * (seeded from these values on first run).
 */
export const STUDY_METHODS = {
  pomodoro: {
    label: 'Pomodoro',
    kind: 'pomodoro',
    focusSeconds: 25 * 60,
    shortBreakSeconds: 5 * 60,
    longBreakSeconds: 15 * 60,
    cyclesBeforeLongBreak: 4,
    autoStartBreak: true,
  },
  fiftyTwoSeventeen: {
    label: '52 / 17',
    kind: 'fifty_two_seventeen',
    focusSeconds: 52 * 60,
    shortBreakSeconds: 17 * 60,
    longBreakSeconds: 17 * 60,
    cyclesBeforeLongBreak: 1,
    autoStartBreak: true,
  },
  deepWork: {
    label: 'Deep Work',
    kind: 'deep_work',
    focusSeconds: 90 * 60,
    shortBreakSeconds: 20 * 60,
    longBreakSeconds: 20 * 60,
    cyclesBeforeLongBreak: 1,
    autoStartBreak: false,
    targetSeconds: 90 * 60,
  },
  flowtime: {
    label: 'Flowtime',
    kind: 'flowtime',
    focusSeconds: 25 * 60, // nominal only; flowtime is open-ended
    shortBreakSeconds: 5 * 60,
    longBreakSeconds: 5 * 60,
    cyclesBeforeLongBreak: 1,
    autoStartBreak: false,
  },
} as const;

export const TIMER = {
  /** authoritative boundary-check cadence (main-window engine) */
  boundaryTickMs: 1000,
  /** display re-render cadence (per window, cosmetic) */
  displayTickMs: 250,
  /** heartbeat write cadence for crash-safety */
  heartbeatMs: 15_000,
  /** recovery: gap under this since last heartbeat => restore paused, else finalize */
  recoveryLiveThresholdMs: 90_000,
  /** recovery/idle: max creditable elapsed (clamp against long sleep) */
  maxRecoverableMs: 5 * 60_000,
  minCustomMinutes: 1,
  maxCustomMinutes: 240,
} as const;

export type StudyMethodKey = keyof typeof STUDY_METHODS;
