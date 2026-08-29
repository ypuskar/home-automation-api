import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic fetch hook with pagination params, loading/error/data states,
 * and a refetch method for manual re-fetching.
 *
 * Builds URL with query params, fetches on mount and when params change.
 *
 * Requirements: 6.1
 */
export function useApi<T>(
  endpoint: string,
  params?: Record<string, string | number>,
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track the latest params to avoid stale closures in refetch
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = buildUrl(endpointRef.current, paramsRef.current);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as T;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Serialize params to a stable string for the dependency array
  const paramsKey = params ? JSON.stringify(params) : '';

  useEffect(() => {
    fetchData();
  }, [endpoint, paramsKey, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/** Build a URL with query parameters appended */
function buildUrl(endpoint: string, params?: Record<string, string | number>): string {
  if (!params || Object.keys(params).length === 0) {
    return endpoint;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  return `${endpoint}?${searchParams.toString()}`;
}
