"use client";

import { useEffect, useState } from "react";
import type { SearchResults } from "@/types/music";

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string; source: string }
  | { status: "error"; query: string; source: string; message: string }
  | { status: "success"; query: string; source: string; results: SearchResults };

// Small in-memory cache so retyping a query or navigating back is instant and
// doesn't spend provider rate limit on identical requests.
const cache = new Map<string, SearchResults>();
const CACHE_LIMIT = 30;

function remember(query: string, results: SearchResults) {
  cache.delete(query);
  cache.set(query, results);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

export function useSearch(
  query: string,
  source: "audius" | "jiosaavn" = "audius",
): SearchState & { retry: () => void } {
  const normalizedQuery = query.trim().toLowerCase();
  const key = `${source}:${normalizedQuery}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ status: "idle" });

  useEffect(() => {
    if (!normalizedQuery || cache.has(key)) return;
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(normalizedQuery)}&source=${source}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Search failed");
        remember(key, body as SearchResults);
        setState({ status: "success", query: normalizedQuery, source, results: body as SearchResults });
      })
      .catch((error: unknown) => {
        // Aborted requests are stale searches the user already typed past.
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Search failed";
        setState({ status: "error", query: normalizedQuery, source, message });
      });
    return () => controller.abort();
  }, [key, normalizedQuery, source, attempt]);

  const retry = () => {
    setState({ status: "loading", query: normalizedQuery, source });
    setAttempt((n) => n + 1);
  };
  if (!normalizedQuery) return { status: "idle", retry };
  const cached = cache.get(key);
  if (cached) return { status: "success", query: normalizedQuery, source, results: cached, retry };
  // Until the effect for a new key starts, report loading rather than a stale result.
  if (state.status === "idle" || state.query !== normalizedQuery || state.source !== source)
    return { status: "loading", query: normalizedQuery, source, retry };
  return { ...state, retry };
}
