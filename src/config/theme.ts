/**
 * JS mirror of motion + chart tokens (CSS is the source for colors/spacing;
 * this is for JS consumers like Framer Motion and Recharts).
 */
export const MOTION = {
  durFast: 0.12,
  durBase: 0.18,
  durSlow: 0.26,
  easeOut: [0.22, 1, 0.36, 1] as const,
  easeInOut: [0.65, 0, 0.35, 1] as const,
} as const;

/** Tokens Recharts needs resolved to concrete rgb() strings (via useThemeColors). */
export const CHART_TOKENS = [
  'primary',
  'accent',
  'success',
  'warning',
  'danger',
  'text-secondary',
  'border',
] as const;

export type ChartToken = (typeof CHART_TOKENS)[number];
