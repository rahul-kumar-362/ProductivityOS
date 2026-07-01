import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@/services/tauri';
import { noteService } from '../services/note.service';

type SaveStatus = 'idle' | 'saving' | 'saved';
const DEBOUNCE_MS = 800;

/** Loads a day's note; autosaves (debounced) on change; flushes on blur/unmount/day-switch. */
export function useDailyNote(day: string) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayRef = useRef(day);
  const contentRef = useRef('');

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void noteService.get(day).then((r) => {
      if (!alive) return;
      const c = r.ok ? r.value : '';
      setContent(c);
      contentRef.current = c;
      dayRef.current = day;
      setStatus('idle');
      setLoading(false);
    });
    return () => {
      alive = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void noteService.save(dayRef.current, contentRef.current);
      }
    };
  }, [day]);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void noteService.save(dayRef.current, contentRef.current).then(() => setStatus('saved'));
  }, []);

  const onChange = useCallback((v: string) => {
    setContent(v);
    contentRef.current = v;
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void noteService.save(dayRef.current, v).then(() => setStatus('saved'));
      timer.current = null;
    }, DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void noteService.save(dayRef.current, contentRef.current);
      }
    },
    [],
  );

  return { content, loading, status, onChange, flush };
}
