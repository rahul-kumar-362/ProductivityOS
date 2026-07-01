import { useEffect } from 'react';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { useSettingsStore } from '@/stores/settings.store';
import { useFloatReady } from '@/features/timer/hooks/useFloatReady';
import { useTimerSync } from '@/features/timer/hooks/useTimerSync';
import { FloatingTimer } from '@/features/timer/components/FloatingTimer';

/**
 * Floating-timer window shell: fully transparent, no chrome. Pure remote — it
 * subscribes to engine broadcasts and sends fire-and-forget commands. Opacity is
 * applied from settings on mount and updated live via the floating://opacity event.
 */
export function FloatWindow() {
  useFloatReady();
  useTimerSync();

  useEffect(() => {
    const apply = (o: number) => document.documentElement.style.setProperty('--timer-opacity', String(o));
    apply(useSettingsStore.getState().floatOpacity);
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<number>(EVENTS.floatingOpacity, (o) => apply(o)).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent">
      <FloatingTimer />
    </div>
  );
}
