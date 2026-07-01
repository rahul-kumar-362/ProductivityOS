import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/shared/components/ui/PageHeader';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { IconButton } from '@/shared/components/ui/IconButton';
import { monthLabel, parseDay } from '@/shared/lib/date';
import { todayLocalDay } from '@/db/time';
import { useCalendar } from '../hooks/useCalendar';
import { CalendarGrid } from '../components/CalendarGrid';
import { DayDetail } from '../components/DayDetail';

export function CalendarPage() {
  const today = todayLocalDay();
  const tp = parseDay(today);
  const [year, setYear] = useState(tp.year);
  const [month, setMonth] = useState(tp.month);
  const [selected, setSelected] = useState<string | null>(today);
  const { matrix, rollups, loading } = useCalendar(year, month);

  const prev = () => (month === 1 ? (setYear((y) => y - 1), setMonth(12)) : setMonth((m) => m - 1));
  const next = () => (month === 12 ? (setYear((y) => y + 1), setMonth(1)) : setMonth((m) => m + 1));
  const goToday = () => {
    setYear(tp.year);
    setMonth(tp.month);
    setSelected(today);
  };

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader
        title="Calendar"
        subtitle="Green = all done · Yellow = partial · Red = none done."
        actions={
          <Button variant="secondary" size="sm" onClick={goToday}>
            Today
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-h3 text-text-primary">{monthLabel(year, month)}</h2>
            <div className="flex gap-1">
              <IconButton label="Previous month" onClick={prev}>
                <ChevronLeft size={16} />
              </IconButton>
              <IconButton label="Next month" onClick={next}>
                <ChevronRight size={16} />
              </IconButton>
            </div>
          </div>
          {loading ? (
            <div className="h-72" />
          ) : (
            <CalendarGrid
              matrix={matrix}
              rollups={rollups}
              year={year}
              month={month}
              today={today}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </Card>
        {selected && <DayDetail day={selected} />}
      </div>
    </div>
  );
}
