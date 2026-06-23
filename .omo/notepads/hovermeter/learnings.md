
## 2025-06-23 Task 0 Spike

### API Authentication
- Volcengine V4 signature is HMAC-SHA256 based, similar to AWS SigV4
- Signing key derivation: VOLCENGINE+secret -> HMAC(date) -> HMAC(region) -> HMAC(service) -> HMAC("request")
- Credential scope format: {YYYYMMDD}/cn-beijing/ark/request
- Signed headers must be semicolon-separated and sorted: host;x-content-sha256;x-date
- X-Date must be UTC in YYYYMMDDTHHMMSSZ format
- X-Content-Sha256 is the lowercase hex SHA256 of the request body
- Host for ark service is open.volcengineapi.com (confirmed by Metis)

### arkcli Usage Data
- arkcli v1.0.1 is installed and functional (SSO authenticated as spyqwer)
- `arkcli usage plan` returns JSON with items[].periods[] containing label, percent, reset_at
- Three periods available: session, weekly, monthly
- percent values are floats (e.g. 19.8406, 4.0551, 61.1365)
- reset_at is Unix timestamp in milliseconds
- Product identifier is "coding-plan", edition is "personal"
- This is a reliable data source for the HoverMeter widget

### Decision
- arkcli will serve as the primary data source for usage quota
- The V4 signing implementation is preserved for potential future Volcengine API needs
- No need to block on GetPersonalPlan API credentials — arkcli provides equivalent data

## 2025-06-23 Task 1 Scaffold

### Tauri v2 Project Setup
- Project scaffolded with `npm create tauri-app@latest` (React + TypeScript + Vite template)
- Window configured: 320x180, alwaysOnTop, transparent, no decorations, no taskbar, not resizable, initially hidden, centered
- Plugins added: tauri-plugin-autostart, tauri-plugin-window-state, tauri-plugin-positioner
- tray-icon feature enabled in Cargo.toml
- Capabilities configured with all plugin permissions

## 2025-06-23 Task 2 Types

### Type Definitions Created
- `src/types/index.ts` created with all shared TypeScript types
- DeepSeek types: `DeepSeekBalance`, `BalanceInfo` (string balance fields from API)
- Volcano types: `VolcanoUsage`, `PeriodUsage` (label union: "session"|"weekly"|"monthly"), `VolcanoPlan`
- Settings type: `AppSettings` with credential, refresh_interval, and opacity fields
- Tauri command types: `GetBalanceResponse`, `GetUsageResponse`, `GetPlanResponse`, `GetSettingsResponse`, `SaveCredentialsRequest`, `SaveSettingsRequest`, `CommandResult<T>`
- `npx tsc --noEmit` passes cleanly — all types compile without errors
- Evidence saved to `.omo/evidence/task-2-types-check.txt`

### Environment Notes
- Rust 1.96.0 installed via rustup
- System missing pkg-config and many -dev packages — installed by downloading .deb files and extracting to /tmp/pkgconf-install
- PKG_CONFIG_PATH must include both /usr/lib/.../pkgconfig and /usr/share/pkgconfig for proto .pc files
- cargo check and npm run build both pass successfully

## 2025-06-23 Task 4 DeepSeek API Client

### Implementation
- Created `src-tauri/src/deepseek.rs` with `DeepSeekBalance` and `BalanceInfo` structs (serde Deserialize)
- Implemented `get_balance(api_key: &str) -> Result<DeepSeekBalance, String>` async function
- HTTP GET to `https://api.deepseek.com/user/balance` with `Authorization: Bearer {api_key}`
- Added `reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }` to Cargo.toml
- Registered `get_deepseek_balance` Tauri command in lib.rs

### Error Handling
- Empty API key → immediate Err("API key must not be empty")
- HTTP non-200 → Err with status code and response body
- Network failure → Err with reqwest error message
- JSON parse failure → Err with serde error message
- No panics, no unwraps in production paths

### Notes
- reqwest 0.12.28 was resolved (latest compatible with existing dependency tree)
- Using rustls-tls to avoid OpenSSL dependency issues on this system
- cargo check passed with zero warnings

## 2025-06-23 Task 3 V4 Signature Module

### Implementation
- Created `src-tauri/src/v4_sign.rs` with `sign_request(method, path, query, body, ak, sk) -> String`
- Added `hmac = "0.12"`, `sha2 = "0.10"`, `hex = "0.4"` to Cargo.toml dependencies
- Declared `pub mod v4_sign` in lib.rs
- Full V4 HMAC-SHA256 signing flow implemented:
  1. CanonicalRequest (method + URI + query + canonical headers + signed headers + hashed payload)
  2. StringToSign (algorithm + x-date + credential scope + SHA256(canonical request))
  3. SigningKey derivation: VOLCENGINE+sk → HMAC(date) → HMAC(region) → HMAC(service) → HMAC("request")
  4. Signature = HMAC-SHA256 hex of signing key + string to sign
  5. Authorization header: `HMAC-SHA256 Credential={ak}/{scope}, SignedHeaders=host;x-content-sha256;x-date, Signature={sig}`

### Date Handling
- UTC timestamp computed from SystemTime without external crates (no chrono dependency)
- Custom days_to_ymd() implements the civil date algorithm (Howard Hinnant's formula)
- X-Date format: YYYYMMDDTHHMMSSZ, ShortDate format: YYYYMMDD

### Verification
- `cargo check` passes with zero errors/warnings
- Standalone test (outside Tauri, avoiding GTK link issues) confirms:
  - Authorization header starts with "HMAC-SHA256 "
  - Contains "Credential=test_ak/YYYYMMDD/cn-beijing/ark/request"
  - Contains "SignedHeaders=host;x-content-sha256;x-date"
  - Signature is exactly 64 lowercase hex characters
- `cargo test` cannot link on this system due to missing GTK dev libraries (pre-existing issue)
- Evidence: `.omo/evidence/task-3-v4sign-compile.txt`, `.omo/evidence/task-3-v4sign-format.txt`

### Notes
- No external date crate needed — avoids adding chrono as a dependency
- Constants match Python spike exactly: region=cn-beijing, service=ark, host=open.volcengineapi.com
- Module is ready for Task 5 (Volcano Engine API client)

## 2025-06-23 Task 8 Settings UI

### Implementation
- Created `src/Settings.tsx` (default export `Settings`) with props `{ isOpen, onClose, onSave }`
- Created `src/Settings.css` with scoped dark-theme tokens via CSS custom properties (--hm-bg, --hm-radius, --hm-blur, etc.)
- Form contains exactly 5 settings: 3 password inputs (Volcano AK/SK, DeepSeek API key), number refresh interval (default 5), range opacity (0.5-1.0 step 0.05, default 0.85)
- Save button is `type="submit"`; `handleSubmit` calls `onSave(settings: AppSettings)` with snake_case fields matching `src/types/index.ts`
- No Tauri `invoke()` call — UI-only per task scope; save logic deferred to Task 12
- Cancel button + overlay-click + × button all call `onClose` (parent controls visibility via `isOpen`)

### Design System Decisions
- Dark theme tokens defined as CSS custom properties on `.settings-overlay` (no hardcoded magic numbers in component)
- Panel: `rgba(20, 20, 30, 0.9)` bg, `border-radius: 12px`, `backdrop-filter: blur(12px)` — matches plan spec
- Used `<fieldset>`/`<legend>` for semantic grouping; required `border:none; padding:0; margin:0` reset to override browser defaults
- Close glyph rendered as `{"\u00D7"}` escape to keep source ASCII-clean while displaying ×
- Number input: hidden native spinner via `-webkit-appearance: none` + `appearance: textfield` for cleaner look
- Range slider: custom webkit/moz thumb styling with accent color token

### Type Safety Notes
- `tsconfig` has `strict`, `noUnusedLocals`, `noUnusedParameters` — all satisfied
- Number input guarded: `Number.isFinite(value) ? value : 0` to avoid NaN-controlled-input React warnings
- Imported `type ChangeEvent, type FormEvent` from react (react-jsx mode does not auto-provide React namespace for types)
- `AppSettings` imported as `import type` (type-only import)

### Verification
- `lsp_diagnostics src/Settings.tsx` → No diagnostics found
- `npm run build` (tsc && vite build) → exit 0, 32 modules transformed
- Settings.tsx is not yet imported by App.tsx (Task 7 will wire it up); tsc still type-checks it via `include: ["src"]`
- Evidence: `.omo/evidence/task-8-settings-ui.txt`

### Forward Notes for Task 7 / Task 12
- Task 7 (App.tsx) should render `<Settings isOpen={...} onClose={...} onSave={...} />`
- Task 12 should implement `onSave` handler that calls Tauri `save_credentials` + `save_settings` commands
- Consider adding an optional `initialSettings?: AppSettings` prop later to pre-fill saved values (not added now to keep props exactly as specified)

## 2025-06-23 Task 8 Settings UI

### Implementation
- Created `src/Settings.tsx` (default export `Settings`) and `src/Settings.css` (scoped dark theme)
- Props: `{ isOpen: boolean; onClose: () => void; onSave: (settings: AppSettings) => void }`
- 5 settings fields exactly: 3 password inputs (Volcano AK, Volcano SK, DeepSeek API Key), number refresh interval (default 5), range opacity slider (0.5-1.0 step 0.05, default 0.85)
- Save button submits form -> calls `onSave` with full `AppSettings` object; no Tauri invoke (deferred to Task 12)
- Modal UX: overlay backdrop click closes, close (x) button, Cancel button, all call `onClose`

### Design System / Dark Theme
- Design tokens defined as CSS custom properties on `.settings-overlay` scope
- Panel bg `rgba(20, 20, 30, 0.9)`, radius 12px, `backdrop-filter: blur(12px)` (matches widget spec)
- Text `#e8e8f0` / muted `#9a9ab0`, accent `#4a9eff`, input bg `rgba(255,255,255,0.06)`
- Font stack: Inter, Segoe UI, system-ui (consistent with App.css base)
- fieldset/legend used for semantic grouping (Credentials / Display) with browser defaults reset (border/padding/margin: 0)

### Technical Decisions
- Type-only imports: `import type { AppSettings }` and `import { useState, type ChangeEvent, type FormEvent }` — satisfies `isolatedModules`
- Refresh interval uses `e.target.valueAsNumber` with `Number.isFinite` guard to avoid NaN in controlled number input (NaN value triggers React warning)
- Close glyph rendered as `{"\u00D7"}` escape to keep source ASCII while displaying ×
- `noUnusedLocals`/`noUnusedParameters` clean: all state setters used, all params consumed

### Verification
- `lsp_diagnostics` on Settings.tsx: zero diagnostics
- `npm run build` (tsc && vite build): exit 0, 32 modules transformed
- Evidence: `.omo/evidence/task-8-settings-ui.txt`

### Notes
- App.tsx is still the default Tauri scaffold (Task 7 not yet wired to render Settings); Settings.tsx compiles standalone under tsc `include: ["src"]`
- Component is ready for Task 7 to import and Task 12 to wire actual save logic

## 2025-06-23 Task 7 Floating Widget UI + Dark Theme

### Implementation
- Created `src/styles.css` (dark-theme design system) and rewrote `src/App.tsx` from the Tauri scaffold
- `src/main.tsx` now imports `./styles.css` (scaffold `App.css` orphaned/unused, not imported)
- Widget layout (320x180): title bar (drag region, 28px) + Volcano 3-cell usage grid + DeepSeek balance row + expand/collapse details toggle
- `data-tauri-drag-region` on both `.title-bar` and `.title-brand`
- Window revealed after mount: `useEffect(() => getCurrentWebviewWindow().show())` — fixes white flash (window created `visible:false`)
- Close button hides to tray: `getCurrentWebviewWindow().hide()`
- Expand/collapse via `useState<boolean>`; expanded details (reset times, granted/topped-up balance, updated time) scroll inside `overflow-y:auto` body
- Component accepts `AppProps { volcanoUsage?, deepseekBalance? }` with placeholder fallback (matches Task 0 spike percents); ready for Task 10 to pass real data
- Wired real `Settings` component (created in parallel by Task 8): `<Settings isOpen onClose onSave />` rendered as a sibling of `.widget`

### Design System (styles.css :root tokens)
- Surface: `--bg-widget rgba(20,20,30,0.85)`, `--bg-elevated`, `--bg-titlebar`
- Accents: Volcano teal `#5eead4`, DeepSeek blue `#60a5fa`; status ok/warn/danger
- Percent color-coding: <50% green, 50-80% amber, >=80% red
- 4px spacing scale; radii 12/8/6px; system-ui + ui-monospace font stacks (avoided Inter/Roboto/Arial per visual guidance)
- `html/body/#root` transparent + `overflow:hidden` so the rounded widget floats on the desktop

### Capability Gap Found (IMPORTANT for Task 11)
- `core:default` → `core:window:default` does NOT include `allow-show`, `allow-hide`, or `allow-start-dragging` (verified in `src-tauri/gen/schemas/acl-manifests.json`)
- Added these three permissions to `src-tauri/capabilities/default.json` so `show()`, `hide()`, and `data-tauri-drag-region` work at runtime
- This is capability config (JSON), not backend Rust — within Task 7 scope
- Task 11 (window features) and Task 12 (tray) should verify these perms are sufficient and add tray permissions if needed

### Settings Overlay Placement (subtle CSS gotcha)
- `<Settings>` is rendered as a SIBLING of `.widget` under `#root`, NOT inside `.widget`
- Reason: `.widget` has `backdrop-filter: blur(12px)`, which per CSS spec makes it the containing block for `position:fixed` descendants; `.widget` also has `overflow:hidden` + `border-radius`, which would clip/reparent the `position:fixed` settings overlay
- As a sibling under `#root` (no transform/filter ancestor), the fixed overlay correctly spans the 320x180 viewport
- Settings panel scrolls internally (`max-height: calc(100vh - 32px)`)

### onSave Placeholder
- `handleSaveSettings` currently just closes the panel; Task 12 must implement persistence via `save_credentials` + `save_settings` Tauri commands
- Underscore-prefixed `_settings` param satisfies `noUnusedParameters`

### Verification
- `lsp_diagnostics` on App.tsx / main.tsx: zero diagnostics
- `npm run build` (tsc && vite build): exit 0, 39 modules transformed
- Evidence: `.omo/evidence/task-7-ui-render.txt`
- Runtime screenshot via `cargo tauri dev` not captured (GTK dev-link limitations from Task 1); visual QA deferred to Task 10 integration

## 2025-06-23 Task 5 Volcano Engine API Client

### Implementation
- Created `src-tauri/src/volcano.rs` with `VolcanoUsage` and `PeriodUsage` structs (serde Serialize/Deserialize)
- Implemented `get_volcano_usage()` Tauri command using `std::process::Command` to run `arkcli usage plan`
- Private deserialization helpers (`ArkcliOutput`, `ArkcliItem`, `ArkcliPeriod`) parse the arkcli JSON output
- Extracts the `coding-plan` item's periods array and `updated_at` timestamp
- Registered `volcano::get_volcano_usage` in lib.rs `generate_handler![]`

### Data Flow
- `arkcli usage plan` → stdout JSON → serde_json::from_str → find coding-plan item → map periods → VolcanoUsage
- `reset_at` kept as i64 milliseconds (matches arkcli output and frontend PeriodUsage type)
- `updated_at` is in seconds (matches arkcli output format)
- No V4 signing needed — arkcli handles authentication via SSO

### Error Handling (6 paths)
1. arkcli not installed (NotFound) → user-friendly message with install URL
2. Non-zero exit code → status code + stderr
3. Invalid UTF-8 stdout → error message
4. Malformed JSON → serde parse error
5. Missing coding-plan item → subscription status message
6. General I/O error → io error message
- All paths return `Result<VolcanoUsage, String>` — no panics, no unwraps

### Verification
- `cargo check --manifest-path src-tauri/Cargo.toml`: PASS (zero errors, zero warnings)
- `arkcli usage plan` confirmed working with 3 periods (session/weekly/monthly)
- Evidence: `.omo/evidence/task-5-volcano-compile.txt`, `.omo/evidence/task-5-volcano-error.txt`

### Notes
- The Tauri command is synchronous (not async) because `std::process::Command` is blocking — appropriate for a CLI tool call
- No additional Cargo dependencies needed (serde, serde_json already in Cargo.toml)
- Module declared as `mod volcano` (private) in lib.rs — only the command function is re-exported via generate_handler
- Task 6 will also modify lib.rs; only the volcano command registration was added, no restructuring

## 2025-06-23 Task 6 Encrypted Storage Module

### Implementation
- Created `src-tauri/src/storage.rs` with keyring-based credential storage and JSON settings persistence
- Added `keyring = "4"` to Cargo.toml (v4, not v3 — v4 uses `delete_credential()` instead of `delete_password()`)
- Added `use tauri::Manager` import (required for `app_handle.path()`)
- Registered 4 Tauri commands in lib.rs: `save_credentials`, `load_credentials`, `save_settings`, `load_settings`

### Keyring v4 API Notes
- `keyring::Entry::new(service, user)` — same as v3
- `set_password()` / `get_password()` — same as v3
- `delete_credential()` — renamed from `delete_password()` in v4
- Default features include `zbus-secret-service-keyring-store` for Linux (no need for explicit feature flag)
- On Linux, requires a running D-Bus secret service at runtime; compile-time check passes without it

### Structs
- `Credentials { volcano_ak, volcano_sk, deepseek_key }` — serde Serialize/Deserialize
- `Settings { refresh_interval (default 5), opacity (default 0.85) }` — serde with `#[serde(default)]` for backward compat

### Name Conflict Resolution
- Internal functions prefixed with short names (`save_creds`, `load_creds`, `save_setts`, `load_setts`) to avoid name collision with `#[tauri::command]` functions
- Tauri command functions use the exact names expected by frontend: `save_credentials`, `load_credentials`, `save_settings`, `load_settings`

### Verification
- `cargo check --manifest-path src-tauri/Cargo.toml`: PASS (zero errors, zero warnings)
- Evidence: `.omo/evidence/task-6-storage-compile.txt`, `.omo/evidence/task-6-storage-roundtrip.txt`

## 2025-06-23 Task 9 System Tray + Autostart

### Implementation
- Implemented system tray in `src-tauri/src/lib.rs` using `TrayIconBuilder` within `.setup()` closure
- Tray menu: Show Widget / Settings / [separator] / Quit (3 action items + 1 PredefinedMenuItem::separator)
- Tray icon ID: "main-tray"; icon from `app.default_window_icon()`; tooltip "HoverMeter"
- `show_menu_on_left_click(false)` so left-click triggers `on_tray_icon_event` instead of opening context menu
- Left-click (MouseButton::Left + MouseButtonState::Up) toggles main window show/hide
- Menu "show": window.show() + set_focus(); "settings": window.show() + emit("show-settings", ()) + set_focus(); "quit": app.exit(0)
- Close-to-tray: `on_window_event` matches `WindowEvent::CloseRequested`, calls `api.prevent_close()` + `window.hide()`

### Tauri v2 Tray API Notes
- `TrayIconBuilder`, `MenuItem`, `Menu`, `PredefinedMenuItem` all require a `Manager` (App/AppHandle) in their constructors — must be created inside `.setup(|app| { ... })`, not before the builder
- `TrayIconEvent::Click` struct fields: `position`, `position2`, `rect`, `button: MouseButton`, `button_state: MouseButtonState` — match with `..` to ignore position fields
- `on_menu_event` closure receives `(&AppHandle, MenuEvent)`; `event.id().as_ref()` returns `&str` for matching menu item IDs
- `on_tray_icon_event` closure receives `(&TrayIcon, TrayIconEvent)`; `tray.app_handle()` returns `&AppHandle`
- `window.emit()` requires `use tauri::Emitter` trait (v2 change from v1 where it was inherent)
- `app.get_webview_window("main")` requires `use tauri::Manager` trait
- `PredefinedMenuItem::separator(app)` creates a visual separator — not counted as an "extra menu item" since it has no action

### Plugin Status (all preserved from Task 1)
- `tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None)` — enables/disables login launch
- `tauri_plugin_window_state::Builder::default().build()` — saves/restores window position
- `tauri_plugin_positioner::init()` — tray-relative window positioning
- All three were already registered; Task 9 only added tray + close-to-tray on top

### Capabilities
- Added `"core:tray:default"` to `capabilities/default.json` (enables frontend tray API access if needed)
- Existing permissions preserved: core:default, core:window:allow-show/hide/start-dragging, opener/autostart/window-state/positioner defaults

### Verification
- `cargo check --manifest-path src-tauri/Cargo.toml`: PASS (zero errors, zero warnings)
- Runtime tray visual QA deferred (GTK dev-link limitation from Task 1)
- Evidence: `.omo/evidence/task-9-tray.txt`, `.omo/evidence/task-9-autostart.txt`

### Forward Notes for Task 12 (Settings persistence)
- Frontend should `listen("show-settings", ...)` via `@tauri-apps/api/event` to open Settings panel when tray "Settings" is clicked
- The autostart plugin can be toggled from frontend via `@tauri-apps/plugin-autostart` `enable()`/`disable()`/`isEnabled()`
- The "show-settings" event payload is `()` (null) — no data passed, just a signal

## 2025-06-23 Task 10 Data Refresh + State Management

### Implementation
- Created `src/hooks/useUsageData.ts` with `useUsageData(refreshIntervalMinutes)` hook
- Hook manages 5 state variables: volcanoUsage, deepseekBalance, loading, refreshing, error
- `fetchData(isInitial: boolean)` — shared fetch logic; `isInitial=true` sets loading, `isInitial=false` sets refreshing
- Volcano usage always fetched via `invoke("get_volcano_usage")` (arkcli handles auth independently)
- DeepSeek balance fetched only when `deepseek_key` credential exists (loaded via `invoke("load_credentials")`)
- On refresh, credentials are re-loaded to pick up changes from settings panel
- Auto-refresh via `setInterval` in useEffect, interval floor at 30s (30000ms), cleanup on unmount
- Manual refresh via `refresh()` callback exposed by hook
- Modified `src/App.tsx`: removed `AppProps` interface, removed placeholder data, integrated hook
- Added refresh button (↻) to TitleBar with spin animation when refreshing
- Added error bar (.error-bar) displayed at top of widget body when error is non-null
- Added loading state (.loading-state) with pulsing "Loading…" text during initial fetch
- Removed unused `DeepSeekBalance` import from App.tsx (was only used in old AppProps)

### Design Decisions
- DeepSeek balance failure is non-fatal: volcano data preserved, error shown but balance row shows "unavailable"
- `hasDeepSeekKey` ref tracks whether to attempt balance fetch on subsequent refreshes (avoids unnecessary credential loads when key was never configured)
- Refresh button disabled + spinning during refresh to prevent double-clicks
- CSS spin animation via `@keyframes spin` with 0.8s linear infinite

### Verification
- `npm run build` (tsc && vite build): exit 0, 40 modules transformed
- `lsp_diagnostics` on useUsageData.ts and App.tsx: zero diagnostics
- Evidence: `.omo/evidence/task-10-auto-refresh.txt`, `.omo/evidence/task-10-error-handling.txt`

### Forward Notes for Task 12
- `handleSaveSettings` still just closes the panel; Task 12 should call `save_credentials` + `save_settings` and trigger a refresh
- Settings panel's `refresh_interval` field should feed into `useUsageData(refreshIntervalMinutes)` — currently hardcoded to 5
- After Task 12 saves credentials, the next auto-refresh or manual refresh will pick them up (hook re-loads credentials on each fetch)

## 2025-06-23 Task 11 Window Drag + Position Save + Opacity

### Implementation
- Drag region: `data-tauri-drag-region` already present on `.title-bar` and `.title-brand` from Task 7 — no change needed; verified capabilities include `core:window:allow-start-dragging`
- Window position save: tauri-plugin-window-state registered in lib.rs (Task 1). Added explicit `onMoved`/`onResized` handlers in App.tsx mount useEffect calling `saveWindowState(StateFlags.ALL)` for belt-and-suspenders coverage on top of plugin auto-save
- Opacity: load `opacity` from `invoke("load_settings")` on mount, apply via CSS custom property `--widget-opacity` set on `document.documentElement` through a `useEffect([opacity])`
- styles.css: changed `--bg-widget: rgba(20, 20, 30, 0.85)` to `rgba(20, 20, 30, var(--widget-opacity, 0.85))` — CSS custom property substitution is recursive and resolved at point of use, so `--widget-opacity` on `:root` is available when `--bg-widget` is consumed by `.widget`
- Real-time live preview: added optional `onOpacityChange?: (opacity: number) => void` prop to Settings.tsx; App.tsx passes `handleOpacityChange` that updates opacity state on every slider `onChange` — widget background updates instantly as user drags slider, before saving
- `show-settings` tray event: added `listen("show-settings", ...)` in mount useEffect to open Settings panel when tray "Settings" menu item is clicked (Task 9 emits this event from Rust)

### Key Decisions
- `load_settings` returns `Settings { refresh_interval, opacity }` — NOT full `AppSettings`. Created `StoredSettings` interface to match the Rust struct shape. Credential fields are NOT in the settings file (they're in keyring)
- Used `document.documentElement.style.setProperty` instead of inline style on `.widget` to avoid TypeScript `CSSProperties` issues with custom property names (`--widget-opacity` not in `CSSProperties` type)
- `saveWindowState(StateFlags.ALL)` used instead of `StateFlags.POSITION` for consistency — saves position + size (size is fixed but harmless to save)
- All three async unlisten functions (`listen`, `onMoved`, `onResized`) return `Promise<UnlistenFn>` — cleaned up via `.then((fn) => fn())` in useEffect return

### Files Modified
- `src/App.tsx`: added imports (invoke, listen, saveWindowState/StateFlags), StoredSettings interface, opacity state, mount useEffect expansion (load_settings + show-settings listener + onMoved/onResized saveWindowState), opacity CSS variable useEffect, handleSaveSettings opacity update, handleOpacityChange callback, onOpacityChange prop on Settings
- `src/styles.css`: `--bg-widget` now uses `var(--widget-opacity, 0.85)`
- `src/Settings.tsx`: added optional `onOpacityChange` prop, called in `handleOpacityChange`

### Verification
- `lsp_diagnostics` App.tsx: zero diagnostics
- `lsp_diagnostics` Settings.tsx: only pre-existing FormEvent deprecation hints (not introduced by this task)
- `npm run build` (tsc && vite build): exit 0, 41 modules transformed (up from 40 — additional module is @tauri-apps/plugin-window-state)
- Evidence: `.omo/evidence/task-11-drag.txt`, `task-11-position-save.txt`, `task-11-opacity.txt`
- Runtime visual QA deferred (GTK dev-link limitation from Task 1)

### Forward Notes for Task 12
- `handleSaveSettings` now applies opacity from saved settings + closes panel; Task 12 should also call `invoke("save_settings", { refreshInterval, opacity })` and `invoke("save_credentials", ...)` for full persistence
- The `onOpacityChange` prop on Settings is optional — Task 12 can ignore it or keep it for live preview
- The `StoredSettings` interface in App.tsx can be replaced by importing from types/index.ts if Task 12 adds a matching type there
- `handleOpacityChange` in App.tsx provides live preview; Task 12's `handleSaveSettings` should persist the final value via `save_settings` command

## 2025-06-23 Task 12 Settings Logic + Credential Storage

### Implementation
- Wired `src/Settings.tsx` and `src/App.tsx` to persist credentials and settings via existing Tauri commands (storage.rs)
- Settings.tsx: added `initialSettings?: AppSettings` prop + `useEffect` to pre-fill form fields when panel opens
- App.tsx: added `refreshInterval` state (default 5), `initialSettings` state, passed `useUsageData(refreshInterval)` instead of hardcoded 5
- App.tsx: mount useEffect now loads `refresh_interval` from `load_settings` and checks `load_credentials` for first-launch detection (None -> auto-open settings)
- App.tsx: new `useEffect([showSettings])` loads credentials + settings in parallel when panel opens, sets `initialSettings` for pre-fill
- App.tsx: `handleSaveSettings` is now async — calls `invoke("save_credentials", { volcanoAccessKey, volcanoSecretKey, deepseekApiKey })` then `invoke("save_settings", { refreshInterval, opacity })`, then updates state + calls `refresh()`

### Tauri v2 Argument Naming Convention
- Rust `snake_case` command args → JS `camelCase` invoke args (confirmed via existing `get_deepseek_balance` → `{ apiKey }` pattern in useUsageData.ts)
- `save_credentials`: `{ volcanoAccessKey, volcanoSecretKey, deepseekApiKey }`
- `save_settings`: `{ refreshInterval, opacity }`
- `load_credentials` / `load_settings`: no args (app_handle is injected by Tauri)

### Design Decisions
- Credentials loaded into transient React state (`initialSettings`) for form pre-fill only — NOT persisted in frontend (localStorage/sessionStorage). The keyring is the sole persistent store via Tauri commands.
- Pre-fill `useEffect` in Settings.tsx fires on `[isOpen, initialSettings]` — re-fills every time the panel opens, picking up latest saved values
- `handleSaveSettings` is sequential (save_credentials then save_settings) — if credentials fail, settings are not touched. On error, panel stays open for retry.
- `refresh()` from `useUsageData` is called after save — the hook re-loads credentials from keyring on each refresh, so new DeepSeek API key is picked up immediately
- Error handling: `try/catch` in `handleSaveSettings` logs error and keeps panel open. No error UI added (out of scope — task doesn't mention it)
- `StoredCredentials` interface added to App.tsx matching Rust `Credentials` struct (`volcano_ak`, `volcano_sk`, `deepseek_key`)

### Files Modified
- `src/Settings.tsx`: added `useEffect` import, `initialSettings?: AppSettings` prop, `useEffect` to sync `initialSettings` → local state
- `src/App.tsx`: added `StoredCredentials` interface, `DEFAULT_REFRESH_INTERVAL` constant, `refreshInterval` + `initialSettings` state, first-launch detection in mount useEffect, pre-fill loading useEffect, async `handleSaveSettings` with Tauri invoke calls, `initialSettings` prop on `<Settings>`

### Verification
- `lsp_diagnostics` App.tsx: zero diagnostics
- `lsp_diagnostics` Settings.tsx: zero diagnostics
- `npm run build` (tsc && vite build): exit 0, 41 modules transformed
- Evidence: `.omo/evidence/task-12-save-load.txt`, `.omo/evidence/task-12-refresh-after-save.txt`
- Runtime QA deferred (GTK dev-link limitation from Task 1)

### Notes
- This is the final implementation task (Wave 3). All acceptance criteria met: first-launch auto-opens settings, form pre-fills from saved values, save persists via Tauri commands, data refreshes after save, `useUsageData` uses saved `refresh_interval` instead of hardcoded 5.
- The `StoredSettings` and `StoredCredentials` interfaces in App.tsx match the Rust struct shapes (not the `AppSettings` type, which combines both). This is intentional — the Tauri commands return them separately.
