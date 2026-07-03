import type { ReactNode } from 'react';
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { useTimer } from '../hooks/useTimer';
import { useDefaultMethodId } from '../hooks/useDefaultMethodId';

/**
 * Compact floating timer surface. Live state via useTimer(); controls are
 * fire-and-forget commands to the main-window engine. Only the readout zone is a
 * drag region, so buttons stay clickable.
 */
export function FloatingTimer() {
  const t = useTimer();
  const defaultMethodId = useDefaultMethodId();

  return (
    <div
      className="m-1 flex h-[calc(100vh-8px)] items-center gap-2 rounded-xl border border-border bg-surface-elevated/90 px-3 shadow-lg backdrop-blur-md"
      style={{ opacity: 'var(--timer-opacity)' }}
    >
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 cursor-move select-none flex-col justify-center"
      >
        <span data-tauri-drag-region className="truncate text-caption text-text-muted">
          {t.isActive ? `${t.methodName ?? ''} · ${t.blockLabel}` : 'ProductivityOS'}
        </span>
        <span
          data-tauri-drag-region
          className="font-mono text-h1 leading-none tabular-nums text-text-primary"
        >
          {t.isActive ? t.display : '--:--'}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {t.status === 'running' && (
          <FloatBtn onClick={t.pause} primary label="Pause">
            <Pause size={16} />
          </FloatBtn>
        )}
        {t.status === 'paused' && (
          <FloatBtn onClick={t.resume} primary label="Resume">
            <Play size={16} />
          </FloatBtn>
        )}
        {!t.isActive && (
          <FloatBtn onClick={() => t.start(defaultMethodId)} primary label="Start">
            <Play size={16} />
          </FloatBtn>
        )}
        {t.isActive && (
          <FloatBtn onClick={t.skip} label="Skip">
            <SkipForward size={15} />
          </FloatBtn>
        )}
        {t.isActive && (
          <FloatBtn onClick={t.stop} label="Stop">
            <Square size={15} />
          </FloatBtn>
        )}
      </div>
    </div>
  );
}

function FloatBtn({
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
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors duration-fast ease-out ${
        primary
          ? 'bg-primary text-primary-fg hover:bg-primary-hover'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
