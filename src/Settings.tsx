/**
 * Settings 组件 — 设置面板
 *
 * 模态弹窗形式显示 DeepSeek API Key、刷新间隔、不透明度、开机自启等配置项。
 * 通过 Tauri invoke 调用 Rust 后端保存设置。
 */

import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "./types";
import { DEFAULT_OPACITY, DEFAULT_REFRESH_INTERVAL } from "./types";
import "./Settings.css";

interface SettingsProps {
  /** 设置面板是否可见 */
  isOpen: boolean;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 保存设置回调，由父组件处理持久化逻辑 */
  onSave: (settings: AppSettings) => void;
  /** 不透明度实时变化回调（拖动滑块时即时生效） */
  onOpacityChange?: (opacity: number) => void;
  /** 面板打开时加载的初始设置值 */
  initialSettings?: AppSettings;
  /** 保存失败时的错误信息 */
  saveError?: string | null;
}

/**
 * 设置面板组件。
 *
 * 包含四个配置项：
 * - DeepSeek API Key（密码输入框）
 * - 刷新间隔（数字输入，最小 1 分钟）
 * - 不透明度（范围滑块 0.5–1.0）
 * - 开机自启（切换开关）
 *
 * 底部提供"打开日志"文本按钮和保存/取消操作按钮。
 */
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

  /** 面板打开且初始设置就绪时同步表单字段 */
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

  /** 刷新间隔输入变更处理（过滤非数字值） */
  const handleRefreshChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.valueAsNumber;
    setRefreshInterval(Number.isFinite(value) ? value : 0);
  };

  /** 不透明度滑块变更处理（实时通知父组件） */
  const handleOpacityChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.valueAsNumber;
    setOpacity(value);
    onOpacityChange?.(value);
  };

  /** 表单提交：收集当前表单值并调用父组件的保存回调 */
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave({
      deepseek_api_key: deepseekApiKey,
      refresh_interval: refreshInterval,
      opacity,
      autostart,
    });
  };

  /** 通过系统文件管理器打开日志目录 */
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
