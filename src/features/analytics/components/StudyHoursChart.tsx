import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useThemeColors } from '@/lib/theme/useThemeColors';
import type { DailyPoint } from '../services/analytics.service';

export function StudyHoursChart({ data }: { data: DailyPoint[] }) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.border} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: c['text-secondary'], fontSize: 11 }}
          axisLine={{ stroke: c.border }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: c['text-secondary'], fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          cursor={{ fill: c.border, opacity: 0.3 }}
          contentStyle={{
            background: 'rgb(var(--surface-elevated))',
            border: '1px solid rgb(var(--border))',
            borderRadius: 8,
            color: 'rgb(var(--text-primary))',
            fontSize: 12,
          }}
          formatter={(v) => [`${v} h`, 'Focus']}
        />
        <Bar dataKey="hours" fill={c.primary} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
