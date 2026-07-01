import { useEffect, useState } from 'react';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { isTauri } from '@/services/tauri';

export function useAutostart() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      setReady(true);
      return;
    }
    isEnabled()
      .then((v) => {
        setEnabled(v);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  const toggle = async (v: boolean) => {
    try {
      if (v) await enable();
      else await disable();
      setEnabled(v);
    } catch (e) {
      console.error('[autostart]', e);
    }
  };

  return { enabled, ready, toggle };
}
