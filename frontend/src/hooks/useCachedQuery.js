import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Minimal stale-while-revalidate cache.
 *
 * Routes unmount on navigation and there was no client cache, so returning to a
 * tab refired every request and showed a full-screen spinner again — switching
 * tabs felt like page loads because it was page loads. This keeps the last
 * response in module scope and hands it back immediately, then refreshes behind
 * it.
 *
 * Deliberately not a data-fetching library: five screens, a handful of endpoints.
 */
const cache = new Map();
const inflight = new Map();
const subscribers = new Map();

function notify(key, value) {
  cache.set(key, { data: value, at: Date.now() });
  subscribers.get(key)?.forEach((fn) => fn(value));
}

/** Drop cached entries so the next read refetches. Call after a mutation. */
export function invalidate(...keys) {
  if (!keys.length) {
    cache.clear();
    return;
  }
  keys.forEach((k) => cache.delete(k));
}

/** Write straight into the cache — used for optimistic updates. */
export function setCached(key, updater) {
  const current = cache.get(key)?.data;
  notify(key, typeof updater === "function" ? updater(current) : updater);
}

export function useCachedQuery(key, fetcher, { enabled = true } = {}) {
  const cached = cache.get(key);
  const [data, setData] = useState(cached?.data);
  // Only a first-ever load blocks the UI; a revalidation renders stale data.
  const [loading, setLoading] = useState(!cached && enabled);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!key) return undefined;
    const subs = subscribers.get(key) || new Set();
    subs.add(setData);
    subscribers.set(key, subs);
    return () => {
      subs.delete(setData);
      if (!subs.size) subscribers.delete(key);
    };
  }, [key]);

  const run = useCallback(async () => {
    if (!key || !enabled) return undefined;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      try {
        const result = await fetcherRef.current();
        notify(key, result);
        setError(null);
        return result;
      } catch (e) {
        setError(e);
        throw e;
      } finally {
        inflight.delete(key);
        setLoading(false);
      }
    })();
    inflight.set(key, p);
    return p.catch(() => undefined);
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled) return;
    setData(cache.get(key)?.data);
    run();
  }, [key, enabled, run]);

  return { data, loading, error, refetch: run };
}
