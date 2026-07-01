/**
 * Result<T, E> — services return these instead of throwing, so hooks/components
 * handle success and failure explicitly.
 */
export interface AppError {
  code: string;
  message?: string;
  cause?: unknown;
}

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E = AppError>(error: E): Result<never, E> => ({ ok: false, error });

/** Wrap a promise, converting thrown errors into a Result. */
export async function tryResult<T>(fn: () => Promise<T>, code = 'UNKNOWN'): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err({ code, message: e instanceof Error ? e.message : String(e), cause: e });
  }
}
