import { ApiError } from './api';
import { friendlyError } from './format';

/**
 * Show the backend's own sentence only for statuses where it is a short, deliberate rule
 * (validation, refusal, conflict). Everything else gets a generic message, never raw text.
 */
export function serverMessage(err: unknown, showFor: number[] = [400, 403, 409]): string {
  if (err instanceof ApiError) {
    const m = err.message?.trim();
    if (showFor.includes(err.status) && m && !m.startsWith('{') && !m.startsWith('<') && m.length < 240) return m;
    return friendlyError(err.status);
  }
  return friendlyError();
}
