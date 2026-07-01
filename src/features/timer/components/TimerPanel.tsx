import type { ReactNode } from 'react';
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { useTimer } from '../hooks/useTimer';
import { useStudyMethods } from '../hooks/useStudyMethods';

function CtrlButton({
  onClick,
  primary,
  label,
  children,
}: {
  onClick: () => void;
  primary?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid h-11 w-11 place-items-center rounded-full transition-colors duration-fast ease-out ${
        primary
          ? 'bg-primary text-primary-fg hover:bg-primary-hover'
          : 'border border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

export function TimerPanel() {
  const t = useTimer();
  const methods = useStudyMethods();

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col items-center gap-4">
        <span className="text-caption uppercase tracking-wide text-text-muted">
          {t.isActive ? `${t.methodName ?? ''} · ${t.blockLabel}` : 'Ready to focus'}
        </span>
        <span className="font-mono text-[3.25rem] font-semibold leading-none tabular-nums text-text-primary">
          {t.isActive ? t.display : '--:--'}
        </span>

        <div className="flex items-center gap-3">
          {t.status === 'running' && (
            <CtrlButton onClick={t.pause} primary label="Pause">
              <Pause size={20} />
            </CtrlButton>
          )}
          {t.status === 'paused' && (
            <CtrlButton onClick={t.resume} primary label="Resume">
              <Play size={20} />
            </CtrlButton>
          )}
          {t.isActive && (
            <CtrlButton onClick={t.skip} label="Skip block">
              <SkipForward size={18} />
            </CtrlButton>
          )}
          {t.isActive && (
            <CtrlButton onClick={t.stop} label="Stop">
              <Square size={18} />
            </CtrlButton>
          )}
        </div>
      </div>

      {!t.isActive && (
        <div className="mt-6">
          <p className="mb-2 text-caption text-text-muted">Start a session</p>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => t.start(m.id)}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-4 py-3 text-left text-body text-text-primary transition-colors duration-fast ease-out hover:border-border-strong hover:bg-surface-hover"
              >
                <span>{m.name}</span>
                <Play size={14} className="text-text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
