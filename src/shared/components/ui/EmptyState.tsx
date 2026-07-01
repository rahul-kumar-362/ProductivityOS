import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      {Icon && (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-hover text-text-muted">
          <Icon size={22} />
        </div>
      )}
      <div>
        <p className="text-h3 text-text-primary">{title}</p>
        {description && <p className="mt-1 text-body-sm text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
