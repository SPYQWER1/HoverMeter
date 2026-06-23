import { useEffect, useState } from "react";
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
import Settings from "./Settings";

// ─── Types ───────────────────────────────────────

/** Shape returned by the `load_settings` Tauri command (storage.rs `Settings`). */
interface StoredSettings {
  refresh_interval: number;
  opacity: number;
}

/** Shape returned by the `load_credentials` Tauri command (storage.rs `Credentials`). */
interface StoredCredentials {
  volcano_ak: string;
  volcano_sk: string;
  deepseek_key: string;
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

function formatTime(ts: number | undefined): string {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
      <div className="title-brand" data-tauri-drag-region>
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
    </div>
  );
}

// ─── App ─────────────────────────────────────────

function App() {
  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [opacity, setOpacity] = useState<number>(DEFAULT_OPACITY);
  const [refreshInterval, setRefreshInterval] = useState<number>(
    DEFAULT_REFRESH_INTERVAL,
  );
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
  } = useUsageData(refreshInterval);

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
      })
      .catch((err: unknown) =>
        console.error("failed to load settings:", err),
      );

    invoke<StoredCredentials | null>("load_credentials")
      .then((creds) => {
        if (!creds) {
          setShowSettings(true);
        }
      })
      .catch((err: unknown) =>
        console.error("failed to check credentials:", err),
      );

    const unlistenSettings = listen("show-settings", () => {
      setShowSettings(true);
    });

    const unlistenMoved = win.onMoved(() => {
      saveWindowState(StateFlags.ALL).catch((err: unknown) =>
        console.error("failed to save window state on move:", err),
      );
    });
    const unlistenResized = win.onResized(() => {
      saveWindowState(StateFlags.ALL).catch((err: unknown) =>
        console.error("failed to save window state on resize:", err),
      );
    });

    return () => {
      unlistenSettings.then((fn) => fn());
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
    Promise.all([
      invoke<StoredCredentials | null>("load_credentials"),
      invoke<StoredSettings>("load_settings"),
    ])
      .then(([creds, settings]) => {
        setInitialSettings({
          volcano_access_key: creds?.volcano_ak ?? "",
          volcano_secret_key: creds?.volcano_sk ?? "",
          deepseek_api_key: creds?.deepseek_key ?? "",
          refresh_interval: settings.refresh_interval,
          opacity: settings.opacity,
        });
      })
      .catch((err: unknown) =>
        console.error("failed to load settings for panel:", err),
      );
  }, [showSettings]);

  const handleHide = () => {
    getCurrentWebviewWindow()
      .hide()
      .catch((err: unknown) => console.error("failed to hide window:", err));
  };

  const handleSaveSettings = async (settings: AppSettings) => {
    try {
      await invoke("save_credentials", {
        volcanoAccessKey: settings.volcano_access_key,
        volcanoSecretKey: settings.volcano_secret_key,
        deepseekApiKey: settings.deepseek_api_key,
      });
      await invoke("save_settings", {
        refreshInterval: settings.refresh_interval,
        opacity: settings.opacity,
      });
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
      <div className="widget">
        <TitleBar
          title="HoverMeter"
          isRefreshing={refreshing}
          onSettings={() => setShowSettings(true)}
          onRefresh={refresh}
          onHide={handleHide}
        />

        <div className="widget-body">
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

              <button
                className={`expand-toggle${expanded ? " is-expanded" : ""}`}
                onClick={() => setExpanded((v) => !v)}
              >
                <span className="chevron">{"\u25B8"}</span>
                <span>{expanded ? "Collapse" : "Details"}</span>
              </button>

              <div className={`details${expanded ? " is-open" : ""}`}>
                {periods.map((p) => (
                  <div className="detail-row" key={p.label}>
                    <span className="detail-key">{p.label} reset</span>
                    <span className="detail-val">
                      in {formatReset(p.reset_at)}
                    </span>
                  </div>
                ))}
                {balanceAvailable && balanceInfo && (
                  <>
                    <div className="detail-row">
                      <span className="detail-key">granted</span>
                      <span className="detail-val">
                        {currencySymbol(balanceInfo.currency)}
                        {balanceInfo.granted_balance}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-key">topped up</span>
                      <span className="detail-val">
                        {currencySymbol(balanceInfo.currency)}
                        {balanceInfo.topped_up_balance}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-key">currency</span>
                      <span className="detail-val">{balanceInfo.currency}</span>
                    </div>
                  </>
                )}
                <div className="detail-row">
                  <span className="detail-key">updated</span>
                  <span className="detail-val">
                    {formatTime(volcanoUsage?.updated_at)}
                  </span>
                </div>
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
