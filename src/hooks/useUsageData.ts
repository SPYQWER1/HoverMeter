/**
 * useUsageData Hook — 数据获取与自动刷新
 *
 * 在组件挂载时获取火山引擎用量和 DeepSeek 余额，
 * 并按照配置的刷新间隔自动轮询。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { VolcanoUsage, DeepSeekBalance } from "../types";

interface UseUsageDataReturn {
  /** 火山引擎用量数据，未获取时为 null */
  volcanoUsage: VolcanoUsage | null;
  /** DeepSeek 余额数据，未获取或未配置 API Key 时为 null */
  deepseekBalance: DeepSeekBalance | null;
  /** 首次加载中（无数据显示） */
  loading: boolean;
  /** 后台刷新中（旧数据仍显示） */
  refreshing: boolean;
  /** 最近一次获取的错误信息，无错误时为 null */
  error: string | null;
  /** 手动触发数据刷新 */
  refresh: () => void;
}

/**
 * 管理火山引擎用量和 DeepSeek 余额的自动获取。
 *
 * - 火山引擎用量始终获取（arkcli 独立认证）
 * - DeepSeek 余额仅在配置了 API Key 时获取
 * - 刷新间隔最小 30 秒，防止频繁请求
 * - 处理竞态条件：API Key 从空变为非空时自动重新获取
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
  const pendingRefetch = useRef(false);

  /**
   * 核心数据获取函数。
   *
   * 并行请求火山引擎和 DeepSeek（如果配置了 API Key）。
   * 使用 fetchInProgress 锁防止并发请求。
   */
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
      if (pendingRefetch.current) {
        pendingRefetch.current = false;
        fetchData(false);
      }
    }
  }, []);

  /** 挂载时首次获取数据 */
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  /**
   * 当 API Key 从空变为非空时重新获取 DeepSeek 余额。
   * 如果正在获取中则标记待重取，当前请求结束后自动触发。
   */
  const prevKeyRef = useRef(deepseekApiKey);
  useEffect(() => {
    if (!prevKeyRef.current && deepseekApiKey) {
      if (fetchInProgress.current) {
        pendingRefetch.current = true;
      } else {
        fetchData(false);
      }
    }
    prevKeyRef.current = deepseekApiKey;
  }, [deepseekApiKey, fetchData]);

  /** 定时轮询（最小间隔 30 秒） */
  useEffect(() => {
    const ms = Math.max(30_000, refreshIntervalMinutes * 60_000);
    const id = setInterval(() => {
      fetchData(false);
    }, ms);
    return () => clearInterval(id);
  }, [refreshIntervalMinutes, fetchData]);

  /** 手动刷新（暴露给组件） */
  const refresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  return { volcanoUsage, deepseekBalance, loading, refreshing, error, refresh };
}
