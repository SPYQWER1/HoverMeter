import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "./types";
import "./Settings.css";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  onOpacityChange?: (opacity: number) => void;
  initialSettings?: AppSettings;
  saveError?: string | null;
}

const DEFAULT_REFRESH_INTERVAL = 5;
const DEFAULT_OPACITY = 0.85;

function Settings({
  isOpen,
  onClose,
  onSave,
  onOpacityChange,
  initialSettings,
  saveError,
}: SettingsProps) {
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [refreshInterval, setRefreshInterval] = useState<number>(
    DEFAULT_REFRESH_INTERVAL,
  );
  const [opacity, setOpacity] = useState<number>(DEFAULT_OPACITY);
  const [autostart, setAutostart] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !initialSettings) return;
    setDeepseekApiKey(initialSettings.deepseek_api_key);
    setRefreshInterval(initialSettings.refresh_interval);
    setOpacity(initialSettings.opacity);
    setAutostart(initialSettings.autostart);
  }, [isOpen, initialSettings]);

  if (!isOpen) {
    return null;
  }

  const handleRefreshChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.valueAsNumber;
    setRefreshInterval(Number.isFinite(value) ? value : 0);
  };

  const handleOpacityChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.valueAsNumber;
    setOpacity(value);
    onOpacityChange?.(value);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave({
      deepseek_api_key: deepseekApiKey,
      refresh_interval: refreshInterval,
      opacity,
      autostart,
    });
  };

  const handleOpenLogs = async () => {
    try {
      await invoke("open_log_dir");
    } catch (err) {
      console.error("Failed to open log directory:", err);
    }
  };

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
        aria-label="设置"
      onClick={onClose}
    >
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <form className="settings-form" onSubmit={handleSubmit}>
          {saveError && (
            <div className="settings-error">{saveError}</div>
          )}
          <section className="settings-section">
            <label className="settings-row">
              <span className="settings-label">DeepSeek API Key</span>
              <input
                type="password"
                className="settings-input settings-input-key"
                value={deepseekApiKey}
                onChange={(e) => setDeepseekApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </section>

          <section className="settings-section">
            <label className="settings-row">
              <span className="settings-label">刷新间隔</span>
              <div className="settings-inline-input">
                <input
                  type="number"
                  className="settings-input settings-input-number"
                  min={1}
                  step={1}
                  value={refreshInterval}
                  onChange={handleRefreshChange}
                />
                <span className="settings-suffix">分钟</span>
              </div>
            </label>

            <label className="settings-row">
              <span className="settings-label">不透明度</span>
              <div className="settings-inline-input">
                <input
                  type="range"
                  className="settings-slider"
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  value={opacity}
                  onChange={handleOpacityChange}
                />
                <span className="settings-value">{opacity.toFixed(2)}</span>
              </div>
            </label>

            <label className="settings-row">
              <span className="settings-label">开机自启</span>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={autostart}
                  onChange={(e) => setAutostart(e.target.checked)}
                />
                <span className="settings-toggle-track" />
              </label>
            </label>
          </section>

          <div className="settings-footer">
            <button
              type="button"
              className="settings-text-button"
              onClick={handleOpenLogs}
            >
              打开日志
            </button>
            <div className="settings-footer-actions">
              <button
                type="button"
                className="settings-button settings-button-secondary"
                onClick={onClose}
              >
                取消
              </button>
              <button type="submit" className="settings-button">
                保存
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Settings;
