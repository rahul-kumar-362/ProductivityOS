/** Route paths. `/float` is the floating-timer window (sibling, no chrome). */
export const ROUTES = {
  home: '/',
  tasks: '/tasks',
  completed: '/tasks/completed',
  history: '/tasks/history',
  calendar: '/calendar',
  notes: '/notes',
  analytics: '/analytics',
  settings: '/settings',
  float: '/float',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
