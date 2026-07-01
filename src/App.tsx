/**
 * App 组件 — HoverMeter 主界面
 *
 * 负责窗口生命周期、设置管理、数据展示协调。
 * 组合 TitleBar、UsageCell、Settings 等子组件。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import type {
  BalanceInfo,
  AppSettings,
} from "./types";
import { DEFAULT_OPACITY, DEFAULT_REFRESH_INTERVAL } from "./types";
import { useUsageData } from "./hooks/useUsageData";
import { useWindowDock } from "./hooks/useWindowDock";
import { TitleBar } from "./components/TitleBar";
import { UsageCell } from "./components/UsageCell";
import { currencySymbol, formatBeijingTime } from "./utils/format";
import Settings from "./Settings";

/**
 * 应用主组件。
 *
 * 挂载后加载持久化设置、显示窗口、注册事件监听。
 * 协调火山引擎用量数据和 DeepSeek 余额数据的展示。
 */
function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [opacity, setOpacity] = useState<number>(DEFAULT_OPACITY);
  const [refreshInterval, setRefreshInterval] = useState<number>(
    DEFAULT_REFRESH_INTERVAL,
  );
  const [deepseekApiKey, setDeepseekApiKey] = useState<string>("");
  const [initialSettings, setInitialSettings] = useState<
    AppSettings | undefined
  >(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    volcanoUsage,
    deepseekBalance,
    loading,
    refreshing,
    error,
    refresh,
  } = useUsageData(refreshInterval, deepseekApiKey);

  const pendingWindowStateSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [widgetHovered, setWidgetHovered] = useState(false);
  // 设置面板打开时保持窗口完全显示，
  // 防止鼠标移动到设置面板上时触发窗口隐藏动画。
  const effectiveHovered = widgetHovered || showSettings;
  const { dockState, forceHideToDock } = useWindowDock(effectiveHovered);

  const dockStateRef = useRef(dockState.edge);
  dockStateRef.current = dockState.edge;
  const hidingRef = useRef(false);

  /**
   * 初始化副作用：
   * 1. 显示窗口（tauri.conf.json 中 visible:false，避免白色闪烁）
   * 2. 加载持久化设置
   * 3. 注册 show-settings / hide-requested 事件监听
   * 4. 注册窗口移动/缩放事件，延迟保存窗口位置
   */
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    win
      .show()
      .catch((err: unknown) =>
        console.error("failed to show window:", err),
      );

    invoke<AppSettings>("load_settings")
      .then((settings) => {
        if (settings.deepseek_api_key) {
          setDeepseekApiKey(settings.deepseek_api_key);
        }
        if (
          typeof settings.opacity === "number" &&
          Number.isFinite(settings.opacity)
        ) {
          setOpacity(settings.opacity);
        }
        if (
          typeof settings.refresh_interval === "number" &&
          Number.isFinite(settings.refresh_interval)
        ) {
          setRefreshInterval(settings.refresh_interval);
        }
        if (!settings.deepseek_api_key) {
          setShowSettings(true);
        }
      })
      .catch((err: unknown) =>
        console.error("failed to load settings:", err),
      );

    const unlistenSettings = listen("show-settings", () => {
      setShowSettings(true);
    });

    const unlistenHideRequested = listen("hide-requested", () => {
      handleHide();
    });

    /**
     * 延迟保存窗口位置（300ms 防抖）。
     * 窗口停靠时不保存，避免保存被隐藏的位置。
     */
    const scheduleSaveState = () => {
      if (dockStateRef.current) return;
      if (pendingWindowStateSave.current) {
        clearTimeout(pendingWindowStateSave.current);
      }
      pendingWindowStateSave.current = setTimeout(() => {
        saveWindowState(StateFlags.POSITION).catch((err: unknown) =>
          console.error("failed to save window state:", err),
        );
      }, 300);
    };

    const unlistenMoved = win.onMoved(scheduleSaveState);
    const unlistenResized = win.onResized(scheduleSaveState);

    return () => {
      if (pendingWindowStateSave.current) {
        clearTimeout(pendingWindowStateSave.current);
      }
      unlistenSettings.then((fn) => fn());
      unlistenHideRequested.then((fn) => fn());
      unlistenMoved.then((fn) => fn());
      unlistenResized.then((fn) => fn());
    };
  }, []);

  /** 将不透明度值同步到 CSS 自定义属性 `--widget-opacity` */
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--widget-opacity",
      String(opacity),
    );
  }, [opacity]);

  /**
   * 设置面板打开时重新加载设置（确保显示最新值），
   * 同时验证自启动状态与 OS 注册表是否一致。
   */
  useEffect(() => {
    if (!showSettings) {
      setSaveError(null);
      return;
    }
    invoke<AppSettings>("load_settings")
      .then(async (settings) => {
        setInitialSettings({
          deepseek_api_key: settings.deepseek_api_key,
          refresh_interval: settings.refresh_interval,
          opacity: settings.opacity,
          autostart: settings.autostart,
        });

        try {
          const osAutostart = await invoke<boolean>("get_autostart");
          if (osAutostart !== settings.autostart) {
            console.warn(
              `Autostart mismatch: JSON=${settings.autostart}, OS=${osAutostart}`,
            );
          }
        } catch {
          console.warn("Could not verify autostart state with OS");
        }
      })
      .catch((err: unknown) =>
        console.error("failed to load settings for panel:", err),
      );
  }, [showSettings]);

  /**
   * 隐藏窗口到系统托盘。
   * 等待停靠动画完成后隐藏，防止 WebView2 无响应。
   */
  const handleHide = useCallback(async () => {
    if (hidingRef.current) return;
    hidingRef.current = true;

    try {
      await forceHideToDock();
    } catch (err: unknown) {
      console.error("failed to hide window:", err);
    } finally {
      hidingRef.current = false;
    }
  }, [forceHideToDock]);

  /**
   * 保存设置到 Rust 后端：
   * 1. 持久化到 JSON 文件
   * 2. 更新 OS 自启动注册表
   * 3. 同步到组件状态
   * 4. 触发数据刷新
   */
  const handleSaveSettings = async (settings: AppSettings) => {
    try {
      setSaveError(null);
      await invoke("save_settings", {
        deepseekApiKey: settings.deepseek_api_key,
        refreshInterval: settings.refresh_interval,
        opacity: settings.opacity,
        autostart: settings.autostart,
      });
      await invoke("set_autostart", { enable: settings.autostart });
      setDeepseekApiKey(settings.deepseek_api_key);
      setOpacity(settings.opacity);
      setRefreshInterval(settings.refresh_interval);
      setShowSettings(false);
      refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : String(err);
      console.error("failed to save settings:", msg);
      setSaveError(`保存失败: ${msg}`);
    }
  };

  /** 实时更新不透明度（拖动滑块时即时生效） */
  const handleOpacityChange = (value: number) => {
    setOpacity(value);
  };

  const periods = volcanoUsage?.periods ?? [];
  const balanceInfo: BalanceInfo | undefined =
    deepseekBalance?.balance_infos?.[0];
  const balanceAvailable = Boolean(
    deepseekBalance?.is_available && balanceInfo,
  );

  return (
    <>
      <div
        className="widget"
        onMouseEnter={() => setWidgetHovered(true)}
        onMouseLeave={() => setWidgetHovered(false)}
      >
        <TitleBar
          title="HoverMeter"
          isRefreshing={refreshing}
          onSettings={() => setShowSettings(true)}
          onRefresh={refresh}
          onHide={handleHide}
        />

        <div className={`widget-body${deepseekApiKey ? "" : " no-deepseek"}`}>
          {error && (
            <div className="error-bar">
              <span className="error-text">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="loading-state">
               <span className="loading-text">加载中{"\u2026"}</span>
            </div>
          ) : (
            <>
              <section className="section">
                 <span className="section-label">火山引擎</span>
                <div className="usage-grid">
                  {periods.length > 0 ? (
                    periods.map((p) => (
                      <UsageCell key={p.label} period={p} />
                    ))
                  ) : (
                    <div className="balance-value is-unavailable">
                       不可用
                    </div>
                  )}
                </div>
              </section>

              {deepseekApiKey && (
                <section className="section">
                  <span className="section-label">DeepSeek</span>
                  <div className="balance-row">
                    <span className="balance-label">余额</span>
                    <span
                      className={`balance-value${
                        balanceAvailable ? "" : " is-unavailable"
                      }`}
                    >
                      {balanceAvailable && balanceInfo
                        ? `${currencySymbol(balanceInfo.currency)}${balanceInfo.total_balance}`
                        : "不可用"}
                    </span>
                  </div>
                </section>
              )}

              <div className="update-footer">
                更新于 {formatBeijingTime(volcanoUsage?.updated_at)}
              </div>
            </>
          )}
        </div>

      </div>

      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveSettings}
        onOpacityChange={handleOpacityChange}
        initialSettings={initialSettings}
        saveError={saveError}
      />
    </>
  );
}

export default App;
