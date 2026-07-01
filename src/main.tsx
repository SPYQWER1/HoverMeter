/**
 * HoverMeter 前端入口
 *
 * 初始化日志转发，渲染 React 根组件。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initLogging } from "./utils/log";
import "./styles.css";

/** 将 console 输出转发到 Tauri 日志插件（写入日志文件） */
initLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
