import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import type {
  PeriodUsage,
  BalanceInfo,
  AppSettings,
} from "./types";
import { useUsageData } from "./hooks/useUsageData";
import { useWindowDock } from "./hooks/useWindowDock";
import Settings from "./Settings";

// ─── Types ───────────────────────────────────────

/** Shape returned by the `load_settings` Tauri command (storage.rs `Settings`). */
interface StoredSettings {
  deepseek_api_key: string;
  refresh_interval: number;
  opacity: number;
}

const DEFAULT_OPACITY = 0.85;
const DEFAULT_REFRESH_INTERVAL = 5;

// ─── Helpers ─────────────────────────────────────

type PercentStatus = "ok" | "warn" | "danger";

function percentStatus(percent: number): PercentStatus {
  if (percent >= 80) return "danger";
  if (percent >= 50) return "warn";
  return "ok";
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

function formatReset(resetAt: number): string {
  const diff = resetAt - Date.now();
  if (diff <= 0) return "now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hours < 24) return `${hours}h ${remMin}m`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatBeijingTime(ts: number | undefined): string {
  if (!ts) return "\u2014";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "CNY":
    case "RMB":
      return "\u00A5";
    case "USD":
      return "$";
    case "EUR":
      return "\u20AC";
    case "GBP":
      return "\u00A3";
    default:
      return `${currency} `;
  }
}

// ─── TitleBar ────────────────────────────────────

interface TitleBarProps {
  title: string;
  isRefreshing: boolean;
  onSettings: () => void;
  onRefresh: () => void;
  onHide: () => void;
}

function TitleBar({
  title,
  isRefreshing,
  onSettings,
  onRefresh,
  onHide,
}: TitleBarProps) {
  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-brand">
        <span className="title-dot" />
        <span>{title}</span>
      </div>
      <div className="title-actions">
        <button
          className={`icon-btn${isRefreshing ? " is-spinning" : ""}`}
          title="Refresh"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {"\u21BB"}
        </button>
        <button className="icon-btn" title="Settings" onClick={onSettings}>
          {"\u2699"}
        </button>
        <button
          className="icon-btn icon-btn--close"
          title="Hide to tray"
          onClick={onHide}
        >
          {"\u2715"}
        </button>
      </div>
    </div>
  );
}

// ─── UsageCell ───────────────────────────────────

function UsageCell({ period }: { period: PeriodUsage }) {
  const status = percentStatus(period.percent);
  return (
    <div className={`usage-cell is-${status}`}>
      <span className="usage-label">{period.label}</span>
      <span className="usage-value">{formatPercent(period.percent)}</span>
      <span className="usage-reset">{`in ${formatReset(period.reset_at)}`}</span>
    </div>
  );
}

// ─── App ─────────────────────────────────────────

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
  // Keep the docked widget revealed while the settings panel is open,
  // otherwise moving the cursor onto the settings overlay would make the
  // widget think the mouse left and slide back/hide.
  const effectiveHovered = widgetHovered || showSettings;
  const { dockState, prepareForHide } = useWindowDock(effectiveHovered);

  const dockStateRef = useRef(dockState.edge);
  dockStateRef.current = dockState.edge;
  const hidingRef = useRef(false);

  // Reveal the window after mount to avoid the initial white flash.
  // The window is created with visible:false in tauri.conf.json.
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    win
      .show()
      .catch((err: unknown) =>
        console.error("failed to show window:", err),
      );

    invoke<StoredSettings>("load_settings")
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

    const scheduleSaveState = () => {
      if (dockStateRef.current) return;
      if (pendingWindowStateSave.current) {
        clearTimeout(pendingWindowStateSave.current);
      }
      pendingWindowStateSave.current = setTimeout(() => {
        saveWindowState(StateFlags.ALL).catch((err: unknown) =>
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

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--widget-opacity",
      String(opacity),
    );
  }, [opacity]);

  useEffect(() => {
    if (!showSettings) return;
    invoke<StoredSettings>("load_settings")
      .then((settings) => {
        setInitialSettings({
          deepseek_api_key: settings.deepseek_api_key,
          refresh_interval: settings.refresh_interval,
          opacity: settings.opacity,
        });
      })
      .catch((err: unknown) =>
        console.error("failed to load settings for panel:", err),
      );
  }, [showSettings]);

  const handleHide = useCallback(async () => {
    if (hidingRef.current) return;
    hidingRef.current = true;

    try {
      const win = getCurrentWebviewWindow();
      const visible = await win.isVisible();
      if (!visible) return;

      await prepareForHide();
      await win.hide();
    } catch (err: unknown) {
      console.error("failed to hide window:", err);
    } finally {
      hidingRef.current = false;
    }
  }, [prepareForHide]);

  const handleSaveSettings = async (settings: AppSettings) => {
    try {
      await invoke("save_settings", {
        deepseekApiKey: settings.deepseek_api_key,
        refreshInterval: settings.refresh_interval,
        opacity: settings.opacity,
      });
      setDeepseekApiKey(settings.deepseek_api_key);
      setOpacity(settings.opacity);
      setRefreshInterval(settings.refresh_interval);
      setShowSettings(false);
      refresh();
    } catch (err: unknown) {
      console.error("failed to save settings:", err);
    }
  };

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
              <span className="loading-text">Loading\u2026</span>
            </div>
          ) : (
            <>
              <section className="section">
                <span className="section-label">Volcano Engine</span>
                <div className="usage-grid">
                  {periods.length > 0 ? (
                    periods.map((p) => (
                      <UsageCell key={p.label} period={p} />
                    ))
                  ) : (
                    <div className="balance-value is-unavailable">
                      unavailable
                    </div>
                  )}
                </div>
              </section>

              {deepseekApiKey && (
                <section className="section">
                  <span className="section-label">DeepSeek</span>
                  <div className="balance-row">
                    <span className="balance-label">Balance</span>
                    <span
                      className={`balance-value${
                        balanceAvailable ? "" : " is-unavailable"
                      }`}
                    >
                      {balanceAvailable && balanceInfo
                        ? `${currencySymbol(balanceInfo.currency)}${balanceInfo.total_balance}`
                        : "unavailable"}
                    </span>
                  </div>
                </section>
              )}

              <div className="update-footer">
                updated {formatBeijingTime(volcanoUsage?.updated_at)}
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
      />
    </>
  );
}

export default App;
