import { useRouteError } from 'react-router-dom';

/** Route-level error boundary — keeps one bad screen from killing the whole app. */
export function RouteError() {
  const err = useRouteError();
  const msg = err instanceof Error ? err.message : String(err);
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-8 text-center">
      <div className="max-w-md">
        <p className="text-h2 text-text-primary">Something went wrong</p>
        <p className="mt-2 break-words font-mono text-body-sm text-text-muted">{msg}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-body font-medium text-primary-fg hover:bg-primary-hover"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
