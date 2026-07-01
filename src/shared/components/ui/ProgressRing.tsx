import type { ReactNode } from 'react';

/** Circular progress ring (0..1). Progress starts at 12 o'clock. */
export function ProgressRing({
  pct,
  size = 30,
  stroke = 3,
  tone = 'primary',
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  tone?: 'primary' | 'success';
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  const offset = circ * (1 - clamped);
  const color = tone === 'success' ? 'rgb(var(--success))' : 'rgb(var(--primary))';
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--border))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 300ms ease' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}
