import { useCallback } from 'react';
import { windowService } from '@/services/window.service';

/** Open/close the floating timer window from the main window. */
export function useFloatingWindow() {
  const open = useCallback(() => void windowService.openFloatingTimer(), []);
  const close = useCallback(() => void windowService.closeFloatingTimer(), []);
  return { open, close };
}
