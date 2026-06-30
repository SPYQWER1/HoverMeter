# HoverMeter

基于 Tauri v2 的轻量桌面悬浮组件，实时显示**火山引擎 coding plan**用量和 **DeepSeek API** 余额 —— 紧凑的 290×156 窗口。

## 功能

- **火山引擎 coding plan 用量** — 通过 `arkcli` 展示当前、本周、本月的 coding plan 用量百分比
- **DeepSeek 余额** — 显示账户余额，支持多币种（CNY / USD 等）
- **自动刷新** — 可配置的轮询间隔（默认 5 分钟）
- **屏幕边缘吸附** — 自动吸附到最近的屏幕边缘，鼠标悬停时滑出
- **透明窗口** — 可调节透明度，始终置顶，不在任务栏显示
- **系统托盘** — 左键点击切换窗口显隐；右键菜单（显示 / 设置 / 打开日志 / 退出）
- **关闭即隐藏** — 关闭窗口时隐藏到托盘而非退出
- **设置持久化** — 所有配置（含 API Key）以 JSON 形式保存在应用数据目录

## 截图

> TODO：待补充截图

## 技术栈

| 层 | 技术 |
|-------|-----------|
| 前端 | React 19、TypeScript 5.8、Vite 7 |
| 后端 | Rust（Tauri v2） |
| 接口 | DeepSeek REST API、`arkcli` CLI |
| 存储 | JSON 文件 |
| 窗口 | 透明、始终置顶、无边框 |

## 环境要求

- **Node.js** ≥ 18 + npm
- **Rust** 工具链（stable）
- **`arkcli`** 已安装并在 PATH 中（用于获取火山引擎 coding plan 用量数据）— [安装指南](https://www.volcengine.com/docs/82379)

## 初始化配置

首次启动 HoverMeter 后，由于尚未配置 DeepSeek API Key，应用会自动弹出**设置面板**，需要完成以下初始化：

### 1. 获取 DeepSeek API Key

登录 [DeepSeek 开放平台](https://platform.deepseek.com/)，在「API Keys」页面创建或复制已有 Key（以 `sk-` 开头）。

### 2. 安装 arkcli

`arkcli` 是火山引擎的命令行工具，用于查询 coding plan 用量。请确保已安装并在系统 PATH 中：

```bash
# 验证 arkcli 是否可用
arkcli usage plan
```

如果命令不可用，请参考[火山引擎文档](https://www.volcengine.com/docs/82379)完成安装。

### 3. 配置设置

在设置面板中填写以下配置项：

| 设置项 | 默认值 | 说明 |
|---------|---------|-------------|
| DeepSeek API Key | （空） | 用于查询余额的 API 密钥 |
| 刷新间隔 | 5 分钟 | 数据轮询间隔（最小 1 分钟） |
| 透明度 | 0.85 | 组件透明度（0.5–1.0） |

### 4. 保存并生效

点击「Save」后：
- API Key 与刷新间隔、透明度一起保存到 JSON 配置文件
- 刷新间隔和透明度保存为 JSON 配置文件
- 组件自动开始拉取数据

> 后续可通过系统托盘右键菜单 →「Settings」随时修改配置。

## 开发

```bash
# 安装依赖
npm install

# 启动 Tauri 开发模式（带热重载）
npm run tauri dev

# 仅前端开发（浏览器模式，无 Tauri API）
npm run dev               # Vite 开发服务器，端口 1420

# 类型检查 + 前端构建
npm run build             # tsc && vite build

# Rust 单元测试
cargo test -p hovermeter  # 在 src-tauri/ 或项目根目录执行

# 构建发布版本
npm run tauri build
```

构建产物：
- `src-tauri/target/release/bundle/msi/HoverMeter_*.msi`
- `src-tauri/target/release/bundle/nsis/HoverMeter_*-setup.exe`
- `src-tauri/target/release/hovermeter.exe`

## 项目结构

```
src/                       前端（React / TypeScript）
├── App.tsx                 主组件界面
├── Settings.tsx            设置面板
├── hooks/
│   ├── useUsageData.ts     数据获取 Hook
│   └── useWindowDock.ts    屏幕边缘吸附逻辑
├── types/index.ts          共享 TypeScript 类型定义
└── utils/log.ts            前端日志

src-tauri/src/             后端（Rust）
├── lib.rs                  应用初始化、系统托盘、Tauri 命令
├── volcano.rs              arkcli 子进程封装
├── deepseek.rs             DeepSeek HTTP API 客户端
├── storage.rs              JSON 设置持久化
└── main.rs                 入口文件
```

## 许可证

MIT
