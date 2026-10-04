'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';

interface UseApiResult<T> {
  data: T | null;
  /** True only while there is nothing to show yet (first load, or after the inputs changed). */
  loading: boolean;
  /** True while re-reading after a refetch(): the previous data stays on screen meanwhile. */
  refreshing: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * Fetches with `fn`. Two deliberate rules:
 *  - refetch() (e.g. after a real mutation) keeps the current data visible instead of flashing a skeleton;
 *  - if the inputs (`deps` / `enabled`) change, the old data is DROPPED first, so one patient's data
 *    can never be shown while another's is loading.
 */
export function useApi<T>(fn: () => Promise<T>, deps: React.DependencyList = [], enabled = true): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const prev = useRef<{ deps: React.DependencyList; enabled: boolean } | null>(null);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const inputsChanged = !prev.current || prev.current.enabled !== enabled
      || prev.current.deps.length !== deps.length || prev.current.deps.some((d, i) => !Object.is(d, deps[i]));
    prev.current = { deps, enabled };

    if (!enabled) {
      setData(null);
      setError(null);
      setFetching(false);
      return;
    }
    if (inputsChanged) setData(null);

    let cancelled = false;
    setFetching(true);
    setError(null);
    fn()
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err : new ApiError(0, 'Network error.')); })
      .finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, enabled, ...deps]);

  return { data, loading: fetching && data === null, refreshing: fetching && data !== null, error, refetch };
}
