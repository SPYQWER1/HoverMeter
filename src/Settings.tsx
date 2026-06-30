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
}

const DEFAULT_REFRESH_INTERVAL = 5;
const DEFAULT_OPACITY = 0.85;

function Settings({
  isOpen,
  onClose,
  onSave,
  onOpacityChange,
  initialSettings,
}: SettingsProps) {
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [refreshInterval, setRefreshInterval] = useState<number>(
    DEFAULT_REFRESH_INTERVAL,
  );
  const [opacity, setOpacity] = useState<number>(DEFAULT_OPACITY);

  useEffect(() => {
    if (!isOpen || !initialSettings) return;
    setDeepseekApiKey(initialSettings.deepseek_api_key);
    setRefreshInterval(initialSettings.refresh_interval);
    setOpacity(initialSettings.opacity);
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
      aria-label="Settings"
      onClick={onClose}
    >
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button
            type="button"
            className="settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            {"\u00D7"}
          </button>
        </header>

        <div className="settings-scroll">
          <form className="settings-form" onSubmit={handleSubmit}>
            <fieldset className="settings-section">
              <legend className="settings-section-title">Credentials</legend>

              <label className="settings-field">
                <span className="settings-label">DeepSeek API Key</span>
                <input
                  type="password"
                  className="settings-input"
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                  placeholder="Enter API key"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </fieldset>

            <fieldset className="settings-section">
              <legend className="settings-section-title">Display</legend>

              <label className="settings-field">
                <span className="settings-label">Refresh Interval</span>
                <div className="settings-row">
                  <input
                    type="number"
                    className="settings-input"
                    min={1}
                    step={1}
                    value={refreshInterval}
                    onChange={handleRefreshChange}
                  />
                  <span className="settings-suffix">min</span>
                </div>
              </label>

              <label className="settings-field">
                <span className="settings-label">Opacity</span>
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
              </label>
            </fieldset>

            <div className="settings-footer">
              <button
                type="button"
                className="settings-button settings-button-secondary"
                onClick={handleOpenLogs}
              >
                Open Logs
              </button>
              <div className="settings-footer-actions">
                <button
                  type="button"
                  className="settings-button settings-button-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button type="submit" className="settings-button">
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Settings;
