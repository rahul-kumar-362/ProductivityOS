import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  NotebookPen,
  Settings,
} from 'lucide-react';
import { ROUTES } from '@/config/routes.config';
import { ThemeToggle } from './ThemeToggle';

const items = [
  { to: ROUTES.home, label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: ROUTES.tasks, label: 'Tasks', icon: CheckSquare, end: false },
  { to: ROUTES.calendar, label: 'Calendar', icon: CalendarDays, end: false },
  { to: ROUTES.notes, label: 'Notes', icon: NotebookPen, end: false },
  { to: ROUTES.analytics, label: 'Analytics', icon: BarChart3, end: false },
  { to: ROUTES.settings, label: 'Settings', icon: Settings, end: false },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-4 py-4">
        <span className="text-h3 text-text-primary">ProductivityOS</span>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-body-sm transition-colors duration-fast ease-out ${
                isActive
                  ? 'bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`
            }
          >
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center justify-between border-t border-border px-3 py-3">
        <span className="text-caption text-text-muted">v0.1.0</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
