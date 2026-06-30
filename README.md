# HoverMeter

A lightweight Tauri v2 desktop widget that floats on your screen, showing real-time usage data from **Volcano Engine Coding Plan** and **DeepSeek API** balance — all in a compact 290×156 window.

## Features

- **Volcano Engine Usage** — displays session, weekly, and monthly coding-plan usage percentages via `arkcli`
- **DeepSeek Balance** — shows account balance across currencies (CNY/USD/etc.)
- **Auto Refresh** — configurable polling interval (default: 5 minutes)
- **Screen Edge Docking** — auto-docks to the nearest screen edge, slides out on hover
- **Transparent Window** — adjustable opacity, always-on-top, no taskbar entry
- **System Tray** — left-click toggles visibility; right-click menu (Show / Settings / Open Logs / Quit)
- **Close → Tray** — closing the window hides to tray instead of quitting
- **Credentials in OS Keyring** — API keys stored securely via the system keychain
- **Settings Persisted** — refresh interval and opacity saved as JSON in app data directory

## Screenshots

> TODO: add screenshots

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.8, Vite 7 |
| Backend | Rust (Tauri v2) |
| APIs | DeepSeek REST API, `arkcli` CLI |
| Storage | OS keyring (`keyring` crate), JSON file |
| Window | Transparent, always-on-top, no decorations |

## Prerequisites

- **Node.js** ≥ 18 + npm
- **Rust** toolchain (stable)
- **`arkcli`** installed and on PATH (for Volcano Engine usage data) — [install guide](https://www.volcengine.com/docs/82379)
- OS keychain access (Linux: `libsecret` / `gnome-keyring`)

## Development

```bash
# Install dependencies
npm install

# Run Tauri dev app (with hot-reload)
npm run tauri dev

# Frontend only (browser, no Tauri APIs)
npm run dev               # Vite dev server on port 1420

# Typecheck + build frontend
npm run build             # tsc && vite build

# Rust tests
cargo test -p hovermeter  # from src-tauri/ or repo root
```

## Build Release

```bash
npm run tauri build
```

Outputs:
- `src-tauri/target/release/bundle/msi/HoverMeter_*.msi`
- `src-tauri/target/release/bundle/nsis/HoverMeter_*-setup.exe`
- `src-tauri/target/release/hovermeter.exe`



## Project Structure

```
src/                       Frontend (React/TypeScript)
├── App.tsx                 Main widget UI
├── Settings.tsx            Settings panel
├── hooks/
│   ├── useUsageData.ts     Data fetching hook
│   └── useWindowDock.ts    Screen edge docking logic
├── types/index.ts          Shared TypeScript types
└── utils/log.ts            Frontend logging

src-tauri/src/             Backend (Rust)
├── lib.rs                  App setup, tray, Tauri commands
├── volcano.rs              arkcli subprocess wrapper
├── deepseek.rs             DeepSeek HTTP API client
├── storage.rs              Keyring + JSON settings persistence
└── main.rs                 Entry point
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| DeepSeek API Key | (empty) | API key for balance queries |
| Refresh Interval | 5 min | How often to poll for new data |
| Opacity | 0.85 | Widget transparency (0.5–1.0) |

## License

MIT
