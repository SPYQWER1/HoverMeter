/**
 * log.ts — 前端日志转发
 *
 * 重写 console.log/debug/info/warn/error，
 * 将所有控制台输出同时转发到 Tauri 日志插件（写入文件 + WebView 控制台）。
 */

import {
  debug,
  error,
  info,
  trace,
  warn,
} from "@tauri-apps/plugin-log";

/**
 * 将参数数组序列化为单个字符串。
 * 字符串直接拼接，对象尝试 JSON.stringify，失败则用 String()。
 */
function stringify(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

/**
 * 将指定 console 方法转发到 Tauri 日志插件。
 *
 * 保留原始 console 行为（开发时仍可在浏览器控制台看到输出），
 * 同时将格式化后的消息写入日志文件。
 */
function forwardConsole(
  fnName: "log" | "debug" | "info" | "warn" | "error",
  logger: (message: string) => Promise<void>,
) {
  const original = console[fnName];
  console[fnName] = (...args: unknown[]) => {
    original(...args);
    logger(stringify(args)).catch(() => {
      // 忽略转发错误，防止无限循环。
    });
  };
}

/**
 * 初始化日志转发。
 *
 * 将 console.log → trace, console.debug → debug,
 * console.info → info, console.warn → warn, console.error → error。
 * 应在应用入口（main.tsx）中首先调用。
 */
export function initLogging(): void {
  forwardConsole("log", trace);
  forwardConsole("debug", debug);
  forwardConsole("info", info);
  forwardConsole("warn", warn);
  forwardConsole("error", error);
}
