import { useState } from 'react';
import { Plus } from 'lucide-react';

export function TaskComposer({ onAdd }: { onAdd: (title: string) => void }) {
  const [val, setVal] = useState('');
  const submit = () => {
    const t = val.trim();
    if (!t) return;
    onAdd(t);
    setVal('');
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:border-border-strong">
      <Plus size={16} className="shrink-0 text-text-muted" />
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Add a task…"
        className="flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted outline-none"
      />
    </div>
  );
}
