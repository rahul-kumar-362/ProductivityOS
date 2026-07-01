import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAppBootstrap } from '@/features/app/useAppBootstrap';
import { useTrayBridge } from '@/features/app/useTrayBridge';
import { useTimerEngineHost } from '@/features/timer/hooks/useTimerEngineHost';
import { useTimerSync } from '@/features/timer/hooks/useTimerSync';
import { useTimerNotifications } from '@/features/timer/hooks/useTimerNotifications';

/**
 * Main window shell: sidebar + scrollable content. Seeds the DB, hosts the
 * authoritative timer engine (sole DB writer), and subscribes to its broadcasts.
 */
export function MainShell() {
  useAppBootstrap();
  useTimerEngineHost();
  useTimerSync();
  useTimerNotifications();
  useTrayBridge();
  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text-primary">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
