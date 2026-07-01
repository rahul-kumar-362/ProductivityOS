import { Card } from './Card';

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-1 text-display font-semibold tabular-nums text-text-primary">{value}</p>
      {sub && <p className="text-caption text-text-muted">{sub}</p>}
    </Card>
  );
}
