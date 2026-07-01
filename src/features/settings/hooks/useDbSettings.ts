import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '@/services/tauri';
import { settingsRepo } from '@/db/repositories/settings.repo';

export interface DbSettings {
  streakMinFocusHours: number;
  streakRestores: number;
  notificationsEnabled: boolean;
  defaultMethodId: number;
}

export function useDbSettings() {
  const [settings, setSettings] = useState<DbSettings | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void (async () => {
      const v: DbSettings = {
        streakMinFocusHours: (await settingsRepo.getNumber('streakDailyMinFocusSeconds', 7200)) / 3600,
        streakRestores: await settingsRepo.getNumber('streakRestoresPerMonth', 1),
        notificationsEnabled: await settingsRepo.getBool('notificationsEnabled', true),
        defaultMethodId: await settingsRepo.getNumber('defaultMethodId', 1),
      };
      if (alive) setSettings(v);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback(async (patch: Partial<DbSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    if (patch.streakMinFocusHours !== undefined)
      await settingsRepo.set('streakDailyMinFocusSeconds', Math.round(patch.streakMinFocusHours * 3600), 'number');
    if (patch.streakRestores !== undefined)
      await settingsRepo.set('streakRestoresPerMonth', patch.streakRestores, 'number');
    if (patch.notificationsEnabled !== undefined)
      await settingsRepo.set('notificationsEnabled', patch.notificationsEnabled, 'boolean');
    if (patch.defaultMethodId !== undefined)
      await settingsRepo.set('defaultMethodId', patch.defaultMethodId, 'number');
  }, []);

  return { settings, update };
}
