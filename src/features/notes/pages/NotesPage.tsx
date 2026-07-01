import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/shared/components/ui/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { IconButton } from '@/shared/components/ui/IconButton';
import { Textarea } from '@/shared/components/ui/Textarea';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { addDays } from '@/shared/lib/date';
import { todayLocalDay } from '@/db/time';
import { useDailyNote } from '../hooks/useDailyNote';

export function NotesPage() {
  const today = todayLocalDay();
  const [day, setDay] = useState(today);
  const { content, loading, status, onChange, flush } = useDailyNote(day);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <PageHeader
        title="Daily note"
        subtitle="One note per day. Autosaves as you type."
        actions={
          day !== today ? (
            <Button variant="secondary" size="sm" onClick={() => setDay(today)}>
              Today
            </Button>
          ) : undefined
        }
      />
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconButton label="Previous day" onClick={() => setDay((d) => addDays(d, -1))}>
              <ChevronLeft size={16} />
            </IconButton>
            <span className="text-h4 tabular-nums text-text-primary">{day}</span>
            <IconButton label="Next day" onClick={() => setDay((d) => addDays(d, 1))}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <span className="text-caption text-text-muted">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <Textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onBlur={flush}
            placeholder="Write about your day — wins, blockers, ideas…"
            className="min-h-[20rem]"
          />
        )}
      </Card>
    </div>
  );
}
