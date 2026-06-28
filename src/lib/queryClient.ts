import { QueryClient } from "@tanstack/react-query";

/**
 * Production-grade QueryClient.
 *
 * DEFAULT PROBLEMS FIXED
 * ──────────────────────
 * new QueryClient() ships with:
 *   staleTime: 0        → every window focus triggers a network request
 *   gcTime: 5 minutes   → fine, but let's be explicit
 *   retry: 3            → 3 retries on ALL errors, including 403/404 (wrong)
 *   refetchOnWindowFocus: true → jarring on mobile when switching apps
 *
 * A shop owner tabbing away from the POS to check WhatsApp should not
 * trigger 7 simultaneous refetch requests when they tab back in.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Data is "fresh" for 60 seconds. Navigating between pages within
         * that window shows cached data instantly (no spinner), with a
         * background refetch only if the data is stale.
         *
         * Pages that need faster data (DailySummary, Dashboard) override
         * this with their own staleTime or refetchInterval.
         */
        staleTime: 60 * 1000,

        /**
         * Keep unused cache for 5 minutes before GC.
         * A user going POS → Products → POS gets instant POS load the
         * second time from cache, not another round trip.
         */
        gcTime: 5 * 60 * 1000,

        /**
         * Only retry on actual network errors (status 0 or no response).
         * Never retry on 4xx (auth/permission errors) — retrying a 403
         * three times just creates noise and delays the user seeing the error.
         */
        retry: (failureCount, error: any) => {
          if (failureCount >= 2) return false;
          // Don't retry on client errors
          const status = error?.status ?? error?.code;
          if (status && status >= 400 && status < 500) return false;
          return true;
        },

        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),

        /**
         * On mobile, switching to another app and back triggers
         * window focus events constantly. Disable the refetch —
         * staleTime handles freshness instead.
         */
        refetchOnWindowFocus: false,

        /**
         * If a query is mounted but network was down, refetch when
         * connection is restored. Critical for the offline-first POS.
         */
        refetchOnReconnect: true,
      },

      mutations: {
        /**
         * Never auto-retry mutations — a failed sale insert should not
         * silently retry and potentially duplicate the transaction.
         */
        retry: false,
      },
    },
  });
}
