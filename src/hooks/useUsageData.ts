import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { VolcanoUsage, DeepSeekBalance } from "../types";

interface Credentials {
  deepseek_key: string;
}

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
 * DeepSeek balance is only fetched when a `deepseek_key` credential exists.
 */
export function useUsageData(
  refreshIntervalMinutes: number = 5,
): UseUsageDataReturn {
  const [volcanoUsage, setVolcanoUsage] = useState<VolcanoUsage | null>(null);
  const [deepseekBalance, setDeepseekBalance] =
    useState<DeepSeekBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDeepSeekKey = useRef(false);
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
      // Always fetch volcano usage — arkcli handles its own auth.
      const volcanoPromise = invoke<VolcanoUsage>("get_volcano_usage");

      // Check for DeepSeek credentials first.
      let balancePromise: Promise<DeepSeekBalance> | null = null;

      if (isInitial) {
        // On first load, check if credentials exist.
        const creds = await invoke<Credentials | null>("load_credentials");
        if (creds?.deepseek_key) {
          hasDeepSeekKey.current = true;
          balancePromise = invoke<DeepSeekBalance>("get_deepseek_balance", {
            apiKey: creds.deepseek_key,
          });
        }
      } else if (hasDeepSeekKey.current) {
        // On refresh, re-load credentials in case they changed.
        const creds = await invoke<Credentials | null>("load_credentials");
        if (creds?.deepseek_key) {
          hasDeepSeekKey.current = true;
          balancePromise = invoke<DeepSeekBalance>("get_deepseek_balance", {
            apiKey: creds.deepseek_key,
          });
        } else {
          hasDeepSeekKey.current = false;
        }
      }

      // Fetch volcano usage (always).
      const volcano = await volcanoPromise;
      setVolcanoUsage(volcano);

      // Fetch DeepSeek balance if applicable.
      if (balancePromise) {
        try {
          const balance = await balancePromise;
          setDeepseekBalance(balance);
        } catch (balanceErr) {
          // DeepSeek failure is non-fatal — show error but keep volcano data.
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

  // Initial fetch on mount.
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Auto-refresh interval.
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
