import { createHashRouter } from 'react-router-dom';
import { ROUTES } from '@/config/routes.config';
import { MainShell } from '@/windows/MainShell';
import { FloatWindow } from '@/windows/FloatWindow';
import { RouteError } from '@/shared/components/RouteError';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { TasksPage } from '@/features/tasks/pages/TasksPage';
import { CalendarPage } from '@/features/calendar/pages/CalendarPage';
import { NotesPage } from '@/features/notes/pages/NotesPage';
import { AnalyticsPage } from '@/features/analytics/pages/AnalyticsPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';

/**
 * Hash routing so both Tauri windows load the same bundle and select their view
 * by URL fragment (`#/` main, `#/float` floating) — reliable in dev and in the
 * bundled file:// build without a server.
 */
export const router = createHashRouter([
  {
    path: ROUTES.home,
    element: <MainShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'notes', element: <NotesPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: ROUTES.float, element: <FloatWindow />, errorElement: <RouteError /> },
]);
