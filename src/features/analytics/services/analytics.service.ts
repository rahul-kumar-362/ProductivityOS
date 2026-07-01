import { addDays } from '@/shared/lib/date';
import { todayLocalDay } from '@/db/time';
import { dayRollupRepo } from '@/db/repositories/dayRollup.repo';
import { streakService } from '@/features/streaks/services/streak.service';
import { tryResult, type Result } from '@/shared/lib/result';

export interface DailyPoint {
  day: string;
  label: string; // MM-DD
  hours: number;
  focusSeconds: number;
  tasksTotal: number;
  tasksCompleted: number;
}

export interface AnalyticsView {
  daily: DailyPoint[];
  totalFocusSeconds: number;
  totalTasksCompleted: number;
  activeDays: number;
  completionRate: number; // 0..1
  currentStreak: number;
  longestStreak: number;
}

export const analyticsService = {
  load: (days = 14): Promise<Result<AnalyticsView>> =>
    tryResult<AnalyticsView>(async () => {
      const today = todayLocalDay();
      const start = addDays(today, -(days - 1));
      const rollups = await dayRollupRepo.getRange(start, today);
      const map = new Map(rollups.map((r) => [r.localDay, r]));

      const daily: DailyPoint[] = [];
      for (let i = 0; i < days; i++) {
        const day = addDays(start, i);
        const r = map.get(day);
        const focusSeconds = r?.focusSeconds ?? 0;
        daily.push({
          day,
          label: day.slice(5),
          hours: Number((focusSeconds / 3600).toFixed(2)),
          focusSeconds,
          tasksTotal: r?.tasksTotal ?? 0,
          tasksCompleted: r?.tasksCompleted ?? 0,
        });
      }

      const totalFocusSeconds = daily.reduce((a, d) => a + d.focusSeconds, 0);
      const totalTasksCompleted = daily.reduce((a, d) => a + d.tasksCompleted, 0);
      const totalTasks = daily.reduce((a, d) => a + d.tasksTotal, 0);
      const activeDays = daily.filter((d) => d.focusSeconds > 0 || d.tasksTotal > 0).length;
      const completionRate = totalTasks > 0 ? totalTasksCompleted / totalTasks : 0;

      const streak = await streakService.read();
      return {
        daily,
        totalFocusSeconds,
        totalTasksCompleted,
        activeDays,
        completionRate,
        currentStreak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
      };
    }, 'ANALYTICS'),
};
