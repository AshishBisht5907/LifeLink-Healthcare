import { ApiError } from './api';
import { friendlyError } from './format';

/**
 * 400/404 from the access API carry a short, safe, user-actionable sentence
 * ("You already have a pending request..."), so those are shown as-is.
 * Everything else (403, 5xx, network) gets a generic sentence.
 */
export function accessErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if ((err.status === 400 || err.status === 404) && err.message && !err.message.startsWith('{')) return err.message;
    return friendlyError(err.status);
  }
  return friendlyError();
}
