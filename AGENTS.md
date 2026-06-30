# AGENTS.md — HoverMeter

Tauri v2 desktop widget showing Volcano Engine Coding Plan usage + DeepSeek API balance.

## Architecture

```
Frontend (React 19 / TS 5.8 / Vite 7)     Backend (Rust / Tauri v2)
─────────────────────────────────────     ──────────────────────────
src/App.tsx          main widget UI       src-tauri/src/lib.rs     app setup, tray, commands
src/Settings.tsx     settings panel       src-tauri/src/volcano.rs  arkcli subprocess wrapper
src/hooks/useUsageData.ts  data fetch     src-tauri/src/deepseek.rs DeepSeek HTTP API
src/types/index.ts   shared TS types      src-tauri/src/storage.rs  keyring + JSON settings
```

- Window: 320×180, transparent, always-on-top, no decorations, starts hidden (`visible: false` in `tauri.conf.json`), shown by JS on mount.
- Credentials stored in OS keyring (`keyring` crate). Settings stored as JSON in Tauri app data dir.
- Volcano usage: Rust spawns `arkcli usage plan` subprocess, parses JSON stdout.
- DeepSeek balance: Rust calls `GET https://api.deepseek.com/user/balance` with Bearer token.

## Commands

```bash
# Development (Tauri app with hot-reload)
npm run tauri dev

# Frontend only (browser, no Tauri APIs available)
npm run dev              # Vite dev server on port 1420

# Typecheck + build frontend
npm run build            # tsc && vite build

# Rust tests only
cargo test -p hovermeter  # from src-tauri/ or repo root

# Build release binary
npm run tauri build
```

## Release / Publish

The project lives in WSL (`/home/spy/HoverMeter`) but must be built on Windows for native MSVC targets.

### Prerequisites (Windows side)

- **Node.js** + npm (installed)
- **Rust** (installed via `winget install Rustlang.Rustup`)
- `powershell.exe` must be callable from WSL

### Workflow

```bash
# 1. Sync source to Windows Desktop (exclude build artifacts)
rsync -av --delete \
  --exclude 'node_modules' \
  --exclude 'src-tauri/target' \
  --exclude '.git' \
  --exclude '.omo' \
  --exclude 'dist' \
  /home/spy/HoverMeter/ \
  "/mnt/c/Users/15981/Desktop/HoveMeter/"

# 2. Install deps + build on Windows (PATH must include Rust)
powershell.exe -Command \
  '$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); cd "C:\Users\15981\Desktop\HoveMeter"; npm install; npm run tauri build'
```

### Output

| Artifact | Path |
|----------|------|
| MSI installer | `C:\Users\15981\Desktop\HoveMeter\src-tauri\target\release\bundle\msi\HoverMeter_*.msi` |
| NSIS installer | `C:\Users\15981\Desktop\HoveMeter\src-tauri\target\release\bundle\nsis\HoverMeter_*-setup.exe` |
| Standalone exe | `C:\Users\15981\Desktop\HoveMeter\src-tauri\target\release\hovermeter.exe` |

### Gotchas

- **`powershell.exe` from WSL does NOT inherit Windows user PATH** — Rust/Cargo won't be found unless manually loaded via `[System.Environment]::GetEnvironmentVariable`.
- **Windows Desktop path is `HoveMeter`** (missing `r`), not `HoverMeter`.
- **`npm install` and `npm run tauri build` must run on Windows**, not WSL. WSL builds produce Linux binaries.
- **Build verified** (2026-06-29): sync + `npm run tauri build` completed on Windows, producing MSI/NSIS installers and the standalone exe.
- **If the build fails with "拒绝访问" / os error 5**, a running `hovermeter.exe` is locking the output file. Kill it with `Stop-Process -Name hovermeter -Force` and retry.

## Auto-deploy after code changes

Whenever you finish a batch of source-code changes in this project (especially files under `src/` or `src-tauri/src/`), you should **automatically sync the project to Windows and run a release build** so the user gets an up-to-date installer/executable.

Recommended flow:

1. Perform the code edits and verify them (e.g., `npx tsc --noEmit`, `cargo test`, or the checks the user requested).
2. Run the sync + Windows build commands from the **Release / Publish** workflow above.
3. If `hovermeter.exe` is already running and blocks the build, kill it first, then retry.
4. Report the produced artifact paths and sizes.

> **Note:** A true opencode plugin hook (`tool.execute.after`) could trigger this automatically on every edit, but Windows release builds take 30–60 s and are prone to file-lock issues if the app is running. Using AGENTS.md instructions keeps the agent in control so it can batch edits, run checks, handle retries, and surface errors clearly.

## Key facts

- **`arkcli` must be installed and on PATH** for Volcano usage data. Without it, the widget shows an error.
- **No linter or formatter configured** for the frontend. No ESLint, no Prettier.
- **No frontend test framework.** Only Rust unit tests exist (`cargo test`).
- **`npm run build` runs `tsc` first** — type errors block the build.
- **`src/App.css` is dead code** — not imported anywhere. `main.tsx` only imports `styles.css`.
- **`greet` command** in `lib.rs` is a Tauri template leftover, still registered but unused.
- **`index.html` title** still says "Tauri + React + Typescript" (template leftover).
- **`keyring` crate** needs OS keychain access. On headless Linux, this may require `gnome-keyring` or `libsecret`.
- **Tauri dev uses fixed port 1420** with `strictPort: true`. If port is occupied, it fails.
- **Window close is intercepted** — close hides to tray instead of quitting. Quit via tray menu.
- **Tray icon**: left-click toggles window visibility, right-click shows menu (Show/Settings/Quit).
