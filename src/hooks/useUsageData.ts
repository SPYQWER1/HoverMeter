import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { VolcanoUsage, DeepSeekBalance } from "../types";

interface UseUsageDataReturn {
  /** Volcano Engine usage data, or null when not yet fetched / unavailable. */
  volcanoUsage: VolcanoUsage | null;
  /** DeepSeek balance data, or null when not yet fetched / unavailable. */
  deepseekBalance: DeepSeekBalance | null;
  /** True during the initial fetch (no data shown yet). */
  loading: boolean;
  /** True when a background refresh is in progress (data is stale but shown). */
  refreshing: boolean;
  /** Error message from the most recent fetch, or null. */
  error: string | null;
  /** Manually trigger a data refresh. */
  refresh: () => void;
}

/**
 * Fetches Volcano Engine usage and DeepSeek balance on mount and
 * auto-refreshes on a configurable interval.
 *
 * Volcano usage is always fetched (arkcli handles auth independently).
 * DeepSeek balance is only fetched when `deepseekApiKey` is non-empty.
 */
export function useUsageData(
  refreshIntervalMinutes: number = 5,
  deepseekApiKey: string = "",
): UseUsageDataReturn {
  const [volcanoUsage, setVolcanoUsage] = useState<VolcanoUsage | null>(null);
  const [deepseekBalance, setDeepseekBalance] =
    useState<DeepSeekBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deepseekApiKeyRef = useRef(deepseekApiKey);
  deepseekApiKeyRef.current = deepseekApiKey;
  const fetchInProgress = useRef(false);

  const fetchData = useCallback(async (isInitial: boolean) => {
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;

    if (isInitial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const volcanoPromise = invoke<VolcanoUsage>("get_volcano_usage");

      let balancePromise: Promise<DeepSeekBalance> | null = null;

      if (deepseekApiKeyRef.current) {
        balancePromise = invoke<DeepSeekBalance>("get_deepseek_balance", {
          apiKey: deepseekApiKeyRef.current,
        });
      }

      const volcano = await volcanoPromise;
      setVolcanoUsage(volcano);

      if (balancePromise) {
        try {
          const balance = await balancePromise;
          setDeepseekBalance(balance);
        } catch (balanceErr) {
          setError(
            `DeepSeek: ${balanceErr instanceof Error ? balanceErr.message : String(balanceErr)}`,
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    const ms = Math.max(30_000, refreshIntervalMinutes * 60_000);
    const id = setInterval(() => {
      fetchData(false);
    }, ms);
    return () => clearInterval(id);
  }, [refreshIntervalMinutes, fetchData]);

  const refresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  return { volcanoUsage, deepseekBalance, loading, refreshing, error, refresh };
}
