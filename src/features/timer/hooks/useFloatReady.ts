import { useEffect } from 'react';
import { windowService } from '@/services/window.service';

/**
 * Floating-window mount hook: marks the document as the transparent float
 * window (CSS makes html/body transparent) and, after first paint, tells Rust
 * to reveal the window — the anti-black-flash gate.
 */
export function useFloatReady(): void {
  useEffect(() => {
    document.documentElement.dataset.window = 'float';
    const id = requestAnimationFrame(() => {
      void windowService.signalFloatReady();
    });
    return () => {
      cancelAnimationFrame(id);
      delete document.documentElement.dataset.window;
    };
  }, []);
}
