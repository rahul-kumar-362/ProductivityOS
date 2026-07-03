import { useState, type ReactNode } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Switch } from '@/shared/components/ui/Switch';
import { Segmented } from '@/shared/components/ui/Segmented';
import { useStudyMethodManager } from '@/features/timer/hooks/useStudyMethodManager';
import type { CustomMethodDraft, CustomMethodKind } from '@/features/timer/services/studyMethod.service';
import type { StudyMethodRow } from '@/db/schema';
import { useDbSettings } from '../hooks/useDbSettings';

const EMPTY: CustomMethodDraft = {
  name: '',
  kind: 'custom',
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreak: true,
  autoStartNextFocus: false,
};

const toDraft = (m: StudyMethodRow): CustomMethodDraft => ({
  name: m.name,
  kind: m.kind === 'flowtime' ? 'flowtime' : 'custom',
  focusMinutes: Math.round(m.focusSeconds / 60),
  shortBreakMinutes: Math.round(m.shortBreakSeconds / 60),
  longBreakMinutes: Math.round(m.longBreakSeconds / 60),
  cyclesBeforeLongBreak: m.cyclesBeforeLongBreak,
  autoStartBreak: m.autoStartBreak,
  autoStartNextFocus: m.autoStartNextFocus,
});

export function StudyMethodsSection() {
  const { methods, create, update, remove } = useStudyMethodManager();
  const { settings, update: updateSettings } = useDbSettings();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<CustomMethodDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<CustomMethodDraft>) => setDraft((d) => ({ ...d, ...p }));

  const save = async () => {
    const r = editingId === 'new' ? await create(draft) : await update(editingId as number, draft);
    if (r.ok) {
      setEditingId(null);
      setError(null);
    } else {
      setError(r.error.message ?? 'Could not save.');
    }
  };

  const removeMethod = async (id: number) => {
    const r = await remove(id);
    // If the deleted method was the default, fall back to Pomodoro (id 1, always present).
    if (r.ok && settings?.defaultMethodId === id) await updateSettings({ defaultMethodId: 1 });
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-h3 text-text-primary">Study methods</h2>
        {editingId === null && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDraft(EMPTY);
              setEditingId('new');
              setError(null);
            }}
          >
            <Plus size={14} /> New method
          </Button>
        )}
      </div>

      {settings && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <span className="text-body-sm text-text-secondary">
            Default method (used by the floating timer)
          </span>
          <select
            value={settings.defaultMethodId}
            onChange={(e) => void updateSettings({ defaultMethodId: Number(e.target.value) })}
            className="h-9 rounded-md border border-border bg-surface-elevated px-2 text-body text-text-primary"
          >
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <ul className="space-y-1.5">
        {methods.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-body text-text-primary">{m.name}</p>
              <p className="text-caption text-text-muted">
                {m.kind === 'flowtime'
                  ? 'Count-up (open-ended)'
                  : `${Math.round(m.focusSeconds / 60)}m focus · ${Math.round(m.shortBreakSeconds / 60)}m break · ${m.cyclesBeforeLongBreak}×`}
              </p>
            </div>
            {m.isSystem ? (
              <span className="flex items-center gap-1 text-caption text-text-muted">
                <Lock size={12} /> Built-in
              </span>
            ) : (
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Edit method"
                  onClick={() => {
                    setDraft(toDraft(m));
                    setEditingId(m.id);
                    setError(null);
                  }}
                  className="grid h-8 w-8 place-items-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Delete method"
                  onClick={() => void removeMethod(m.id)}
                  className="grid h-8 w-8 place-items-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editingId !== null && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface p-4">
          <Input
            placeholder="Method name"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <Segmented<CustomMethodKind>
            value={draft.kind}
            onChange={(kind) => patch({ kind })}
            options={[
              { value: 'custom', label: 'Intervals' },
              { value: 'flowtime', label: 'Count-up' },
            ]}
          />
          {draft.kind === 'custom' && (
            <>
              <FieldRow label="Focus (min)">
                <Num value={draft.focusMinutes} onChange={(n) => patch({ focusMinutes: n })} />
              </FieldRow>
              <FieldRow label="Short break (min)">
                <Num value={draft.shortBreakMinutes} onChange={(n) => patch({ shortBreakMinutes: n })} />
              </FieldRow>
              <FieldRow label="Long break (min)">
                <Num value={draft.longBreakMinutes} onChange={(n) => patch({ longBreakMinutes: n })} />
              </FieldRow>
              <FieldRow label="Cycles before long break">
                <Num
                  value={draft.cyclesBeforeLongBreak}
                  onChange={(n) => patch({ cyclesBeforeLongBreak: n })}
                />
              </FieldRow>
              <FieldRow label="Auto-start breaks">
                <Switch
                  checked={draft.autoStartBreak}
                  onChange={(v) => patch({ autoStartBreak: v })}
                  label="Auto-start breaks"
                />
              </FieldRow>
              <FieldRow label="Auto-start next focus">
                <Switch
                  checked={draft.autoStartNextFocus}
                  onChange={(v) => patch({ autoStartNextFocus: v })}
                  label="Auto-start next focus"
                />
              </FieldRow>
            </>
          )}
          {error && <p className="text-caption text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingId(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-body-sm text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

function Num({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Input
      type="number"
      min={1}
      step={1}
      className="w-24"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
