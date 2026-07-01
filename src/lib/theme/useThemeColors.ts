/**
 * Resolves CSS color tokens to concrete rgb() strings for Recharts (SVG can't
 * consume rgb(var(--x)) with alpha in all props). Re-reads on theme change.
 *
 * IMPORTANT: getSnapshot MUST return a stable reference between renders, or
 * useSyncExternalStore loops infinitely (React #185). We cache by theme and only
 * recompute when data-theme actually changes.
 */
import { useSyncExternalStore } from 'react';
import { CHART_TOKENS, type ChartToken } from '@/config/theme';

let cache: Record<ChartToken, string> | null = null;
let cacheKey = '';

function read(): Record<ChartToken, string> {
  const theme = document.documentElement.dataset.theme ?? 'dark';
  if (cache && cacheKey === theme) return cache;
  const cs = getComputedStyle(document.documentElement);
  cache = Object.fromEntries(
    CHART_TOKENS.map((t) => [t, `rgb(${cs.getPropertyValue(`--${t}`).trim()})`]),
  ) as Record<ChartToken, string>;
  cacheKey = theme;
  return cache;
}

function subscribe(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}

export function useThemeColors(): Record<ChartToken, string> {
  return useSyncExternalStore(subscribe, read, read);
}
