import { useEffect, useState } from 'react';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { analyticsService, type AnalyticsView } from '../services/analytics.service';

export function useAnalytics(days = 14): { view: AnalyticsView | null; loading: boolean } {
  const [view, setView] = useState<AnalyticsView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    let alive = true;
    let unlisten: (() => void) | undefined;
    const load = () => {
      analyticsService.load(days).then((r) => {
        if (!alive) return;
        if (r.ok) setView(r.value);
        setLoading(false);
      });
    };
    load();
    void listen(EVENTS.statsChanged, load).then((u) => {
      if (!alive) u();
      else unlisten = u;
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [days]);

  return { view, loading };
}
