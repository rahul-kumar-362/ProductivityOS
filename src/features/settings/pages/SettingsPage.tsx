import type { ReactNode } from 'react';
import { PageHeader } from '@/shared/components/ui/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { Switch } from '@/shared/components/ui/Switch';
import { Segmented } from '@/shared/components/ui/Segmented';
import { Input } from '@/shared/components/ui/Input';
import { APP } from '@/config/app.config';
import { EVENTS } from '@/config/events.config';
import { emit } from '@/services/tauri';
import { useSettingsStore } from '@/stores/settings.store';
import type { ThemeChoice } from '@/lib/theme/applyTheme';
import { useDbSettings } from '../hooks/useDbSettings';
import { useAutostart } from '../hooks/useAutostart';
import { StudyMethodsSection } from '../components/StudyMethodsSection';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-h3 text-text-primary">{title}</h2>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Row({ label, hint, control }: { label: string; hint?: string; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-body text-text-primary">{label}</p>
        {hint && <p className="text-caption text-text-muted">{hint}</p>}
      </div>
      {control}
    </div>
  );
}

export function SettingsPage() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const floatOpacity = useSettingsStore((s) => s.floatOpacity);
  const setFloatOpacity = useSettingsStore((s) => s.setFloatOpacity);
  const { settings, update } = useDbSettings();
  const autostart = useAutostart();

  const onOpacity = (v: number) => {
    setFloatOpacity(v);
    void emit(EVENTS.floatingOpacity, v);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <PageHeader title="Settings" subtitle="Make it yours." />

      <Section title="Appearance">
        <Row
          label="Theme"
          control={
            <Segmented<ThemeChoice>
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          }
        />
      </Section>

      <Section title="Floating timer">
        <Row
          label="Opacity"
          hint={`${Math.round(floatOpacity * 100)}%`}
          control={
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={floatOpacity}
              onChange={(e) => onOpacity(Number(e.target.value))}
              className="w-40 accent-primary"
            />
          }
        />
      </Section>

      <StudyMethodsSection />

      <Section title="Streaks">
        <Row
          label="Daily focus goal"
          hint="Hours of focus that qualify a day"
          control={
            <Input
              type="number"
              min={0}
              step={0.5}
              value={settings?.streakMinFocusHours ?? 2}
              onChange={(e) => void update({ streakMinFocusHours: Number(e.target.value) })}
              className="w-24"
            />
          }
        />
        <Row
          label="Restores per month"
          hint="Bridge a missed day"
          control={
            <Input
              type="number"
              min={0}
              step={1}
              value={settings?.streakRestores ?? 1}
              onChange={(e) => void update({ streakRestores: Number(e.target.value) })}
              className="w-24"
            />
          }
        />
      </Section>

      <Section title="Notifications">
        <Row
          label="Desktop notifications"
          hint="Session and break alerts"
          control={
            <Switch
              checked={settings?.notificationsEnabled ?? true}
              onChange={(v) => void update({ notificationsEnabled: v })}
              label="Toggle notifications"
            />
          }
        />
      </Section>

      <Section title="Startup">
        <Row
          label="Launch on boot"
          hint="Start minimized to the tray"
          control={
            <Switch
              checked={autostart.enabled}
              onChange={autostart.toggle}
              label="Toggle launch on boot"
            />
          }
        />
      </Section>

      <Section title="About">
        <Row label={APP.name} hint="Version 0.2.0" control={<span />} />
        <p className="text-caption text-text-muted">
          Your data is stored locally on this device. Nothing is sent anywhere.
        </p>
      </Section>
    </div>
  );
}
