# HoverMeter - AI 用量悬浮窗

## TL;DR

> **Quick Summary**: 构建 Windows 桌面悬浮窗应用，使用 Tauri v2 + React，展示火山引擎 Coding Plan 用量（session/weekly/monthly 百分比）和 DeepSeek 账户余额。悬浮窗始终置顶、半透明、可拖动，支持系统托盘和开机自启。
>
> **Deliverables**:
> - Tauri v2 项目骨架（窗口配置、插件集成）
> - 火山引擎 API 客户端（V4 签名 + spike GetPersonalPlan + fallback arkcli）
> - DeepSeek API 客户端（Bearer Token 余额查询）
> - 暗色悬浮窗 UI（用量展示、设置界面、系统托盘）
> - 本地加密存储（API 密钥安全存储）
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 0 (spike) → Task 3 (V4签名) → Task 5 (火山客户端) → Task 10 (集成) → F1-F4

---

## Context

### Original Request
创建一个 Windows 桌面悬浮窗，用于查看 AI 提供商的用量。现有两个提供商：火山引擎（Coding Plan）和 DeepSeek。

### Interview Summary
**Key Discussions**:
- 技术栈：Tauri v2 + React + TypeScript + Vite
- 火山引擎：Coding Plan 套餐（非 Agent Plan），需显示 session/weekly/monthly 用量百分比
- DeepSeek：账户余额（total/granted/topped_up）
- 悬浮窗：始终置顶、可拖动、点击展开详情、系统托盘+开机自启、半透明
- 数据刷新：定时自动刷新（5分钟）
- UI：暗色模式
- API Key：应用内设置界面（首次启动弹出）
- 测试：无单元测试，Agent QA 场景验证
- 构建：本地 Windows 构建

**Research Findings**:
- DeepSeek API：GET https://api.deepseek.com/user/balance，Bearer Token，返回 is_available + balance_infos[]
- 火山引擎 API：GetUsageDetails/GetAFPUsage **已确认是 Agent Plan 专用**，不适用于 Coding Plan
- 火山引擎可用 API：GetPersonalPlan(Plan="CodingPlan")，使用 AK/SK V4 签名，host=open.volcengineapi.com
- 火山引擎 V4 签名常量：region=cn-beijing, service=ark, credential scope={ShortDate}/cn-beijing/ark/request
- arkcli usage plan 可返回用量数据（SSO 鉴权），作为 fallback
- Tauri v2 窗口配置：alwaysOnTop, transparent, decorations:false, skipTaskbar:true
- Tauri v2 插件：autostart, window-state, positioner, tray-icon
- Windows 透明窗口白闪问题：初始 visible:false，DOM ready 后 show()

### Metis Review
**Identified Gaps** (addressed):
- V4 签名主机错误（ark.cn-beijing.volces.com → open.volcengineapi.com）：已修正
- GetUsageDetails/GetAFPUsage 误认为适用 Coding Plan：已确认不适用，改为 spike GetPersonalPlan
- Task 0 spike 目标错误（GetUsageDetails → GetPersonalPlan）：已修正
- Scope OUT 不完整：已补全
- 构建策略：确认本地 Windows 构建

---

## Work Objectives

### Core Objective
构建一个 Windows 桌面悬浮窗应用，实时展示火山引擎 Coding Plan 和 DeepSeek 的用量/余额数据。

### Concrete Deliverables
- 可运行的 Tauri v2 Windows 桌面应用（.exe）
- 悬浮窗 UI（暗色、半透明、置顶、可拖动）
- 设置界面（配置 AK/SK 和 API Key）
- 系统托盘（显示/隐藏/退出）
- 两个 API 客户端模块（火山引擎 + DeepSeek）
- 5 分钟自动刷新

### Definition of Done
- [ ] 应用可在 Windows 上启动并显示悬浮窗
- [ ] 悬浮窗始终置顶、半透明、可拖动
- [ ] 火山引擎 Coding Plan 用量数据正确显示
- [ ] DeepSeek 余额数据正确显示
- [ ] 系统托盘功能正常（显示/隐藏/退出）
- [ ] 开机自启功能正常
- [ ] 设置界面可配置 API 密钥并保存
- [ ] 5 分钟自动刷新正常工作

### Must Have
- Tauri v2 + React + TypeScript 技术栈
- 火山引擎 Coding Plan 用量（session/weekly/monthly 百分比）
- DeepSeek 余额（total/granted/topped_up）
- 悬浮窗：始终置顶、半透明、可拖动、点击展开
- 系统托盘 + 开机自启
- 暗色模式 UI
- 应用内设置界面
- 5 分钟自动刷新
- API 密钥加密存储

### Must NOT Have (Guardrails)
- 不支持非 Windows 平台（仅 Windows）
- 不支持其他 AI 提供商（仅火山引擎 + DeepSeek）
- 不做历史趋势图表（只显示当前数值）
- 不写单元测试（仅 Agent QA 场景验证）
- 不做 CI/CD pipeline（本地构建）
- 不做多账号支持
- 不做亮色主题切换（仅暗色）
- 不使用 GetUsageDetails/GetAFPUsage API（已确认 Agent Plan 专用）
- 不使用 Cookie/SSO 鉴权作为主方案（仅当火山引擎 V4 签名 API 无法返回 Coding Plan 用量数据时，使用 arkcli 作为有效数据源）
- 不过度抽象（AI slop 防范）
- 不添加不必要的注释和文档

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO（全新项目）
- **Automated tests**: NO（无单元测试）
- **Framework**: none
- **Agent-Executed QA**: ALWAYS（mandatory for all tasks）

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **桌面应用/UI**: 使用 Playwright 或 tmux 截图验证 UI 渲染
- **API 客户端**: 使用 Bash (curl) 验证 API 调用和响应解析
- **Rust 模块**: 使用 Bash (cargo check/build) 验证编译
- **配置/存储**: 使用 Bash 验证文件读写和加密

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Spike - 必须先完成):
└── Task 0: Spike GetPersonalPlan(CodingPlan) API [deep]

Wave 1 (Start Immediately after spike - foundation + scaffolding):
├── Task 1: Tauri v2 项目脚手架 + 窗口配置 [quick]
├── Task 2: 类型定义 + 数据模型 [quick]
├── Task 3: V4 签名模块 [deep]
└── Task 4: DeepSeek API 客户端 [quick]

Wave 2 (After Wave 1 - core modules, MAX PARALLEL):
├── Task 5: 火山引擎 API 客户端 (depends: 2, 3) [deep]
├── Task 6: 加密存储模块 (depends: 2) [quick]
├── Task 7: 悬浮窗主 UI + 暗色主题 (depends: 1, 2) [visual-engineering]
└── Task 8: 设置界面 UI (depends: 1, 2) [visual-engineering]

Wave 3 (After Wave 2 - integration + native):
├── Task 9: 系统托盘 + 开机自启 (depends: 1) [unspecified-high]
├── Task 10: 数据刷新 + 状态管理集成 (depends: 4, 5, 6, 7) [deep]
├── Task 11: 窗口拖动 + 位置保存 + 透明度 (depends: 7) [visual-engineering]
└── Task 12: 设置界面逻辑 + 密钥存储 (depends: 6, 8) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 0 → Task 3 → Task 5 → Task 10 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 0 | - | 5 |
| 1 | - | 7, 8, 9, 10 |
| 2 | - | 5, 6, 7, 8, 10 |
| 3 | - | 5 |
| 4 | - | 10 |
| 5 | 0, 2, 3 | 10 |
| 6 | 2 | 10, 12 |
| 7 | 1, 2 | 10, 11 |
| 8 | 1, 2 | 12 |
| 9 | 1 | - |
| 10 | 4, 5, 6, 7 | F1-F4 |
| 11 | 7 | F1-F4 |
| 12 | 6, 8 | F1-F4 |

### Agent Dispatch Summary

- **Wave 0**: 1 - T0 → `deep`
- **Wave 1**: 4 - T1 → `quick`, T2 → `quick`, T3 → `deep`, T4 → `quick`
- **Wave 2**: 4 - T5 → `deep`, T6 → `quick`, T7 → `visual-engineering`, T8 → `visual-engineering`
- **Wave 3**: 4 - T9 → `unspecified-high`, T10 → `deep`, T11 → `visual-engineering`, T12 → `unspecified-high`
- **FINAL**: 4 - F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 0. Spike: 验证 GetPersonalPlan(CodingPlan) API 返回数据

  **What to do**:
  - 编写一个独立的 Rust 或 Python 脚本，用用户的真实 AK/SK 调用火山引擎 `GetPersonalPlan(Plan="CodingPlan")` API
  - V4 签名请求发往 `https://open.volcengineapi.com/?Action=GetPersonalPlan&Version=2024-01-01`
  - V4 签名常量：region=`cn-beijing`, service=`ark`, credential scope=`{ShortDate}/cn-beijing/ark/request`
  - 请求体：`{"Plan": "CodingPlan"}`
  - 捕获完整 JSON 响应，记录到 `.omo/evidence/task-0-spike-response.json`
  - 分析响应是否包含用量数据（percent/used/quota 等字段），还是仅包含套餐状态（tier/status/validity）
  - 如果 GetPersonalPlan 不返回用量数据，测试 `arkcli usage plan` 命令输出格式，确认可解析

  **Must NOT do**:
  - 不使用 GetUsageDetails 或 GetAFPUsage API（已确认 Agent Plan 专用）
  - 不将 AK/SK 硬编码到脚本中（从环境变量读取）
  - 不修改任何项目源码

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要 V4 签名实现、API 调用、响应分析，属于深度调研任务
  - **Skills**: []
    - 无特定 skill 需要

  **Parallelization**:
  - **Can Run In Parallel**: NO（Wave 0 独立执行，后续任务依赖此结果）
  - **Parallel Group**: Wave 0 (solo)
  - **Blocks**: Task 5 (火山引擎 API 客户端)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - 无现有代码（全新项目）

  **API/Type References**:
  - 火山引擎 V4 签名流程（AWS Sig V4 类似）：CanonicalRequest → StringToSign → SigningKey → Signature
  - GetPersonalPlan 请求体：`{"Plan": "CodingPlan"}`
  - V4 签名 host：`open.volcengineapi.com`（Metis 已确认）
  - V4 签名 credential scope：`{ShortDate}/cn-beijing/ark/request`
  - 签名 key 推导：`kSecret → kDate(HMAC, ShortDate) → kRegion(HMAC, "cn-beijing") → kService(HMAC, "ark") → kSigning(HMAC, "request")`
  - 签名 headers：`host;x-content-sha256;x-date`
  - 用户提供的 arkcli 输出格式（.omo/drafts/hovermeter.md 第 78-92 行）：含 items[].periods[]{label, percent, reset_at}

  **External References**:
  - 火山引擎 V4 签名文档：https://www.volcengine.com/docs/6369/67269
  - GetPersonalPlan API：https://www.volcengine.com/docs/82379/2546382

  **WHY Each Reference Matters**:
  - V4 签名流程是 AK/SK 鉴权的核心，必须正确实现才能调用 API
  - arkcli 输出格式定义了 fallback 方案的数据结构
  - host 和 credential scope 是 V4 签名的关键参数，错误会导致 403

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GetPersonalPlan API 调用成功并记录响应
    Tool: Bash (curl 或 python 脚本)
    Preconditions: 用户已提供 AK/SK（通过环境变量 VOLCENGINE_ACCESS_KEY 和 VOLCENGINE_SECRET_KEY）
    Steps:
      1. 运行 spike 脚本，使用 V4 签名调用 POST https://open.volcengineapi.com/?Action=GetPersonalPlan&Version=2024-01-01
      2. 请求体：{"Plan": "CodingPlan"}
      3. 捕获 HTTP 响应状态码和完整 JSON body
      4. 将响应保存到 .omo/evidence/task-0-spike-response.json
      5. 分析响应 JSON 中是否包含 percent/used/quota 等用量字段
    Expected Result: HTTP 200，JSON 响应包含 ResponseMetadata 和 Result 字段。响应内容已记录到证据文件。
    Failure Indicators: HTTP 403（签名错误）、HTTP 404（API 不存在）、HTTP 400（参数错误）
    Evidence: .omo/evidence/task-0-spike-response.json

  Scenario: arkcli fallback 验证（如果 GetPersonalPlan 不含用量数据）
    Tool: Bash
    Preconditions: arkcli 已安装且已 SSO 登录
    Steps:
      1. 运行 `arkcli usage plan` 命令
      2. 捕获 JSON 输出
      3. 验证输出包含 items[].periods[]{label, percent, reset_at} 结构
      4. 将输出保存到 .omo/evidence/task-0-arkcli-output.json
    Expected Result: JSON 输出包含 product="coding-plan", periods[] 含 session/weekly/monthly 的 percent 和 reset_at
    Failure Indicators: 命令不存在、输出非 JSON、缺少 periods 字段
    Evidence: .omo/evidence/task-0-arkcli-output.json
  ```

  **Commit**: YES
  - Message: `chore(spike): validate GetPersonalPlan Coding Plan API response`
  - Files: spike 脚本文件
  - Pre-commit: 无

---

- [x] 1. Tauri v2 项目脚手架 + 窗口配置

  **What to do**:
  - 使用 `npm create tauri-app@latest` 初始化项目（选择 React + TypeScript + Vite 模板）
  - 配置 `tauri.conf.json` 窗口属性：
    - `alwaysOnTop: true`, `transparent: true`, `decorations: false`, `skipTaskbar: true`
    - `resizable: false`, `visible: false`（初始隐藏避免白闪）
    - `width: 320`, `height: 180`（悬浮窗尺寸）
    - `center: true`
  - 添加 Tauri 插件依赖：tauri-plugin-autostart, tauri-plugin-window-state, tauri-plugin-positioner
  - 配置 `tray-icon` feature
  - 创建 `capabilities/default.json` 权限配置
  - 验证 `cargo tauri dev` 可在 Linux 上启动（开发测试）

  **Must NOT do**:
  - 不配置 GitHub Actions CI（用户选择本地构建）
  - 不添加多余插件（只加需要的 4 个）
  - 不修改窗口尺寸为过大（保持悬浮窗紧凑）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 标准化的项目初始化，模板生成 + 配置文件修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 2, 3, 4 并行）
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7, 8, 9, 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - Tauri v2 窗口配置属性（来自研究结果）：
    ```json
    {"alwaysOnTop": true, "transparent": true, "decorations": false, "skipTaskbar": true, "resizable": false, "visible": false}
    ```
  - 插件安装命令：`npm run tauri add autostart`, `npm run tauri add window-state`, `npm run tauri add positioner`

  **API/Type References**:
  - 无

  **External References**:
  - Tauri v2 官方文档：https://v2.tauri.app/start/
  - Tauri v2 窗口配置：https://v2.tauri.app/reference/config/#windowconfig
  - Tauri v2 系统托盘：https://v2.tauri.app/learn/system-tray/

  **WHY Each Reference Matters**:
  - 窗口配置属性直接决定了悬浮窗的核心行为（置顶、透明、无边框）
  - 插件安装命令确保正确集成 autostart/window-state/positioner

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tauri 项目成功初始化并可编译
    Tool: Bash
    Preconditions: Node.js 和 Rust 已安装
    Steps:
      1. 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
      2. 运行 `npm run build`
      3. 检查 src-tauri/tauri.conf.json 是否包含 alwaysOnTop, transparent, decorations:false, skipTaskbar:true
    Expected Result: cargo check 成功（0 errors），npm run build 成功，tauri.conf.json 包含所有要求的窗口属性
    Failure Indicators: 编译错误、缺少窗口属性、插件未安装
    Evidence: .omo/evidence/task-1-scaffold-check.txt

  Scenario: 插件依赖正确安装
    Tool: Bash
    Preconditions: 项目已初始化
    Steps:
      1. 检查 src-tauri/Cargo.toml 包含 tauri-plugin-autostart, tauri-plugin-window-state, tauri-plugin-positioner
      2. 检查 package.json 包含对应的 @tauri-apps/plugin-* 依赖
      3. 检查 tauri features 包含 "tray-icon"
    Expected Result: Cargo.toml 和 package.json 均包含 4 个插件依赖，tauri features 含 tray-icon
    Failure Indicators: 缺少任何插件依赖
    Evidence: .omo/evidence/task-1-plugins-check.txt
  ```

  **Commit**: YES
  - Message: `feat(scaffold): init Tauri v2 project with window config`
  - Files: src-tauri/, src/, package.json, vite.config.ts
  - Pre-commit: `cargo check --manifest-path src-tauri/Cargo.toml`

---

- [x] 2. 类型定义 + 数据模型

  **What to do**:
  - 创建 `src/types/index.ts` 定义共享 TypeScript 类型
  - 定义 DeepSeek 余额类型：`DeepSeekBalance { is_available: boolean, balance_infos: BalanceInfo[] }`，`BalanceInfo { currency, total_balance, granted_balance, topped_up_balance }`
  - 定义火山引擎用量类型（基于 arkcli 输出）：`VolcanoUsage { periods: PeriodUsage[], updated_at: number }`，`PeriodUsage { label: "session"|"weekly"|"monthly", percent: number, reset_at: number }`
  - 定义火山引擎套餐状态类型：`VolcanoPlan { plan_type: string, status: string, start_time: string, end_time: string, auto_renew: boolean }`
  - 定义设置类型：`AppSettings { volcano_access_key: string, volcano_secret_key: string, deepseek_api_key: string, refresh_interval: number, opacity: number }`
  - 定义 Tauri command 参数和返回类型

  **Must NOT do**:
  - 不定义过多的泛型或工具类型（避免过度抽象）
  - 不定义与服务端无关的类型

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 纯类型定义，无需复杂逻辑
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 1, 3, 4 并行）
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5, 6, 7, 8, 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - DeepSeek API 响应结构（.omo/drafts/hovermeter.md 第 14-23 行）：
    ```json
    {"is_available": true, "balance_infos": [{"currency": "CNY", "total_balance": "110.00", "granted_balance": "10.00", "topped_up_balance": "100.00"}]}
    ```
  - arkcli 输出结构（.omo/drafts/hovermeter.md 第 78-92 行）：
    ```json
    {"items": [{"product": "coding-plan", "periods": [{"label": "session", "percent": 6.37, "reset_at": 1782194415000}], "updated_at": 1782183702}]}
    ```

  **WHY Each Reference Matters**:
  - DeepSeek 响应结构定义了余额数据的字段和类型
  - arkcli 输出结构定义了火山引擎用量数据的字段和类型（fallback 方案的数据源）

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 类型定义正确且可编译
    Tool: Bash
    Preconditions: 项目已初始化（Task 1 完成）
    Steps:
      1. 运行 `npx tsc --noEmit src/types/index.ts`
      2. 检查文件中是否定义了 DeepSeekBalance, VolcanoUsage, VolcanoPlan, AppSettings 类型
      3. 验证 PeriodUsage.label 类型为联合类型 "session"|"weekly"|"monthly"
    Expected Result: tsc 无错误，所有类型已定义，label 为联合类型
    Failure Indicators: tsc 报错、缺少类型定义、label 不是联合类型
    Evidence: .omo/evidence/task-2-types-check.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add shared type definitions and data models`
  - Files: src/types/index.ts
  - Pre-commit: `npx tsc --noEmit`

---

- [x] 3. V4 签名模块

  **What to do**:
  - 创建 `src-tauri/src/v4_sign.rs` 实现火山引擎 V4 HMAC-SHA256 签名
  - 实现签名流程：
    1. 构造 CanonicalRequest（HTTPMethod + CanonicalURI + CanonicalQueryString + CanonicalHeaders + SignedHeaders + HashedPayload）
    2. 构造 StringToSign（Algorithm + RequestDate + CredentialScope + SHA256(CanonicalRequest)）
    3. 推导 SigningKey（HMAC 链式推导：kSecret → kDate → kRegion → kService → kSigning）
    4. 计算 Signature（HMAC-SHA256(SigningKey, StringToSign)）
    5. 构造 Authorization header
  - V4 签名常量：region=`cn-beijing`, service=`ark`, host=`open.volcengineapi.com`
  - 提供 `sign_request(method, path, query, headers, body, ak, sk) -> Authorization` 公开函数
  - 使用 `hmac`, `sha2`, `hex` crate

  **Must NOT do**:
  - 不使用 GetUsageDetails 或 GetAFPUsage API
  - 不硬编码 AK/SK
  - 不过度封装（保持函数简洁直接）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: V4 签名算法复杂，需要精确实现 HMAC-SHA256 链式推导，属于深度技术任务
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 1, 2, 4 并行）
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5 (火山引擎 API 客户端)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - V4 签名流程（AWS Sig V4 类似）：
    ```
    CanonicalRequest = HTTPMethod + "\n" + CanonicalURI + "\n" + CanonicalQueryString + "\n" + CanonicalHeaders + "\n" + SignedHeaders + "\n" + HashedPayload
    StringToSign = "HMAC-SHA256" + "\n" + RequestDate + "\n" + CredentialScope + "\n" + SHA256(CanonicalRequest)
    SigningKey = HMAC-SHA256(HMAC-SHA256(HMAC-SHA256(HMAC-SHA256(SK + date, region), "ark"), "request")
    ```
  - 签名 key 推导链：`kSecret → kDate(HMAC, ShortDate) → kRegion(HMAC, "cn-beijing") → kService(HMAC, "ark") → kSigning(HMAC, "request")`
  - Credential scope 格式：`{ShortDate}/cn-beijing/ark/request`（ShortDate 格式 YYYYMMDD）
  - 签名 headers：`host;x-content-sha256;x-date`
  - X-Date 格式：`YYYYMMDDTHHMMSSZ`（ISO 8601 UTC）
  - X-Content-Sha256：请求体的 SHA256 hex

  **External References**:
  - 火山引擎 V4 签名文档：https://www.volcengine.com/docs/6369/67269
  - Rust hmac crate：https://docs.rs/hmac
  - Rust sha2 crate：https://docs.rs/sha2

  **WHY Each Reference Matters**:
  - V4 签名流程是火山引擎 API 鉴权的核心，任何步骤错误都会导致 403
  - 签名 key 推导链必须严格按照 region → service → "request" 顺序
  - host 必须是 open.volcengineapi.com（Metis 已确认）

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: V4 签名模块编译成功
    Tool: Bash
    Preconditions: 项目已初始化
    Steps:
      1. 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
      2. 检查 src-tauri/src/v4_sign.rs 是否存在
      3. 检查 Cargo.toml 是否包含 hmac, sha2, hex 依赖
    Expected Result: cargo check 成功，v4_sign.rs 存在，依赖已添加
    Failure Indicators: 编译错误、缺少文件、缺少依赖
    Evidence: .omo/evidence/task-3-v4sign-compile.txt

  Scenario: V4 签名生成正确的 Authorization header 格式
    Tool: Bash (cargo test 或 cargo run 示例)
    Preconditions: v4_sign.rs 已编写
    Steps:
      1. 调用 sign_request 函数，传入测试参数（method=POST, path="/", query="Action=GetPersonalPlan&Version=2024-01-01", body='{"Plan":"CodingPlan"}', ak="test_ak", sk="test_sk"）
      2. 检查返回的 Authorization header 格式：`HMAC-SHA256 Credential=test_ak/YYYYMMDD/cn-beijing/ark/request, SignedHeaders=host;x-content-sha256;x-date, Signature=<hex>`
      3. 检查 X-Date 格式为 YYYYMMDDTHHMMSSZ
      4. 检查 X-Content-Sha256 为请求体 SHA256 的 hex
    Expected Result: Authorization header 格式正确，包含 Credential, SignedHeaders, Signature 三部分
    Failure Indicators: 格式错误、缺少部分、host 不是 open.volcengineapi.com
    Evidence: .omo/evidence/task-3-v4sign-format.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): implement Volcano Engine V4 signature module`
  - Files: src-tauri/src/v4_sign.rs, src-tauri/Cargo.toml
  - Pre-commit: `cargo check --manifest-path src-tauri/Cargo.toml`

---

- [x] 4. DeepSeek API 客户端

  **What to do**:
  - 创建 `src-tauri/src/deepseek.rs` 实现 DeepSeek 余额查询客户端
  - 实现 `get_balance(api_key: String) -> Result<DeepSeekBalance, Error>` 函数
  - 调用 `GET https://api.deepseek.com/user/balance`
  - 请求头：`Authorization: Bearer {api_key}`
  - 解析响应 JSON：`is_available`, `balance_infos[]{currency, total_balance, granted_balance, topped_up_balance}`
  - 使用 `reqwest` crate 发送 HTTP 请求
  - 定义 Rust 结构体匹配 TypeScript 类型（Task 2）
  - 创建 Tauri command `get_deepseek_balance` 供前端调用

  **Must NOT do**:
  - 不硬编码 API Key
  - 不做过多错误重试逻辑（简单错误返回即可）
  - 不添加不必要的日志

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 HTTP GET + JSON 解析，Bearer Token 鉴权
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 1, 2, 3 并行）
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 10 (数据刷新集成)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - DeepSeek API 端点：`GET https://api.deepseek.com/user/balance`
  - 鉴权头：`Authorization: Bearer {api_key}`
  - 响应结构（.omo/drafts/hovermeter.md 第 14-23 行）：
    ```json
    {"is_available": true, "balance_infos": [{"currency": "CNY", "total_balance": "110.00", "granted_balance": "10.00", "topped_up_balance": "100.00"}]}
    ```

  **External References**:
  - DeepSeek API 文档：https://api-docs.deepseek.com/zh-cn/api/get-user-balance
  - Rust reqwest crate：https://docs.rs/reqwest

  **WHY Each Reference Matters**:
  - API 端点和鉴权方式是调用 DeepSeek 的基本要求
  - 响应结构定义了 JSON 解析的目标类型

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DeepSeek API 客户端编译成功
    Tool: Bash
    Preconditions: 项目已初始化
    Steps:
      1. 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
      2. 检查 src-tauri/src/deepseek.rs 存在
      3. 检查 Cargo.toml 包含 reqwest 依赖
    Expected Result: cargo check 成功，deepseek.rs 存在，reqwest 依赖已添加
    Failure Indicators: 编译错误、缺少文件
    Evidence: .omo/evidence/task-4-deepseek-compile.txt

  Scenario: DeepSeek API 客户端错误处理
    Tool: Bash
    Preconditions: deepseek.rs 已编写
    Steps:
      1. 调用 get_balance 传入空字符串 API key
      2. 检查返回 Err，错误信息合理
      3. 调用 get_balance 传入 "invalid_key"
      4. 检查返回 Err（HTTP 401 或类似）
    Expected Result: 空和无效 API key 均返回错误，不 panic
    Failure Indicators: panic、返回 Ok、错误信息不明确
    Evidence: .omo/evidence/task-4-deepseek-error.txt
  ```

  **Commit**: YES
  - Message: `feat(deepseek): implement DeepSeek balance API client`
  - Files: src-tauri/src/deepseek.rs, src-tauri/Cargo.toml
  - Pre-commit: `cargo check --manifest-path src-tauri/Cargo.toml`

---

- [x] 5. 火山引擎 API 客户端

  **What to do**:
  - 创建 `src-tauri/src/volcano.rs` 实现火山引擎 Coding Plan 用量查询客户端
  - 根据 Task 0 spike 结果选择数据源：
    - **如果 GetPersonalPlan 返回用量数据**：实现调用 `POST https://open.volcengineapi.com/?Action=GetPersonalPlan&Version=2024-01-01`，请求体 `{"Plan": "CodingPlan"}`，使用 V4 签名（Task 3）
    - **如果 GetPersonalPlan 不返回用量数据**：实现调用 `arkcli usage plan` 命令，解析 JSON stdout
  - 定义 Rust 结构体：`VolcanoUsage { periods: Vec<PeriodUsage>, updated_at: i64 }`，`PeriodUsage { label: String, percent: f64, reset_at: i64 }`
  - 创建 Tauri command `get_volcano_usage` 供前端调用
  - 错误处理：AK/SK 无效、API 返回错误、arkcli 未安装等

  **Must NOT do**:
  - 不使用 GetUsageDetails 或 GetAFPUsage API（已确认 Agent Plan 专用）
  - 不做 Cookie/SSO 鉴权（仅 AK/SK 或 arkcli fallback）
  - 不硬编码 AK/SK

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要根据 spike 结果实现不同方案，V4 签名集成或 arkcli 调用+JSON解析
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 Task 0 spike 结果、Task 2 类型、Task 3 V4 签名）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10
  - **Blocked By**: Task 0, 2, 3

  **References**:
  - Task 0 spike 结果：.omo/evidence/task-0-spike-response.json
  - V4 签名模块：src-tauri/src/v4_sign.rs（Task 3）
  - arkcli 输出格式（.omo/drafts/hovermeter.md 第 78-92 行）：含 items[].periods[]{label, percent, reset_at}
  - V4 签名 host：`open.volcengineapi.com`，请求体：`{"Plan": "CodingPlan"}`
  - GetPersonalPlan API 文档：https://www.volcengine.com/docs/82379/2546382

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 火山引擎客户端编译成功
    Tool: Bash
    Preconditions: Task 0, 2, 3 已完成
    Steps:
      1. 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
      2. 检查 src-tauri/src/volcano.rs 存在
      3. 检查 get_volcano_usage Tauri command 已注册
    Expected Result: cargo check 成功，volcano.rs 存在，command 已注册
    Failure Indicators: 编译错误、缺少文件、command 未注册
    Evidence: .omo/evidence/task-5-volcano-compile.txt

  Scenario: 火山引擎客户端错误处理
    Tool: Bash
    Preconditions: volcano.rs 已编写
    Steps:
      1. 调用 get_volcano_usage 传入空 AK/SK
      2. 检查返回 Err，错误信息合理
      3. 如果使用 arkcli fallback，测试 arkcli 未安装时的错误处理
    Expected Result: 无效凭证返回错误，不 panic
    Failure Indicators: panic、返回 Ok、错误信息不明确
    Evidence: .omo/evidence/task-5-volcano-error.txt
  ```

  **Commit**: YES
  - Message: `feat(volcano): implement Volcano Engine API client`
  - Files: src-tauri/src/volcano.rs
  - Pre-commit: `cargo check --manifest-path src-tauri/Cargo.toml`

---

- [x] 6. 加密存储模块

  **What to do**:
  - 创建 `src-tauri/src/storage.rs` 实现本地加密存储
  - 使用 `keyring` crate 将 API 密钥存储到 OS 凭证管理器（Windows Credential Manager）
  - 实现 `save_credentials(volcano_ak, volcano_sk, deepseek_key)` / `load_credentials() -> Option<Credentials>` 函数
  - 实现 `save_settings(refresh_interval, opacity)` / `load_settings() -> Settings` 函数（非敏感设置存 JSON）
  - 设置文件路径：`%APPDATA%/HoverMeter/settings.json`
  - 凭证存储 key：`hovermeter/volcano_ak`, `hovermeter/volcano_sk`, `hovermeter/deepseek_key`

  **Must NOT do**:
  - 不明文存储 API 密钥（必须用 keyring）
  - 不将密钥写入 JSON 文件
  - 不使用自定义加密算法

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 标准 keyring crate 使用 + 简单 JSON 读写
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 5, 7, 8 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10, 12
  - **Blocked By**: Task 2

  **References**:
  - keyring crate 用法：`keyring::Entry::new(service, user).set_password(password)`
  - 设置文件结构：`{"refresh_interval": 300, "opacity": 0.85}`
  - Rust keyring crate：https://docs.rs/keyring
  - Tauri app data 目录：https://v2.tauri.app/learn/path/

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 加密存储模块编译成功
    Tool: Bash
    Preconditions: Task 2 已完成
    Steps:
      1. 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
      2. 检查 src-tauri/src/storage.rs 存在
      3. 检查 Cargo.toml 包含 keyring 依赖
    Expected Result: cargo check 成功，storage.rs 存在，keyring 依赖已添加
    Failure Indicators: 编译错误、缺少文件
    Evidence: .omo/evidence/task-6-storage-compile.txt

  Scenario: 凭证保存和加载
    Tool: Bash
    Preconditions: storage.rs 已编写
    Steps:
      1. 调用 save_credentials("test_ak", "test_sk", "test_key")
      2. 调用 load_credentials() 验证一致
      3. 清除后调用 load_credentials() 验证返回 None
    Expected Result: 凭证可保存、加载、清除，数据一致
    Failure Indicators: 保存失败、加载不一致
    Evidence: .omo/evidence/task-6-storage-roundtrip.txt
  ```

  **Commit**: YES
  - Message: `feat(storage): implement encrypted credential storage`
  - Files: src-tauri/src/storage.rs, src-tauri/Cargo.toml
  - Pre-commit: `cargo check --manifest-path src-tauri/Cargo.toml`

---

- [x] 7. 悬浮窗主 UI + 暗色主题

  **What to do**:
  - 创建 `src/App.tsx` 实现悬浮窗主界面
  - 暗色主题：背景 `rgba(20, 20, 30, 0.85)`，圆角 12px，backdrop-filter blur
  - 紧凑布局（320x180px）：标题栏（`data-tauri-drag-region`）+ 火山引擎区域（session/weekly/monthly 百分比）+ DeepSeek 区域（total_balance）
  - 点击展开详情：默认精简，点击展开显示完整数据
  - 创建 `src/styles.css` 定义暗色主题样式
  - 窗口初始隐藏，DOM ready 后 `appWindow.show()` 避免白闪
  - 关闭按钮：隐藏到托盘

  **Must NOT do**:
  - 不添加亮色主题
  - 不添加历史趋势图表
  - 不使用 `as any` 或 `@ts-ignore`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 前端 UI 实现，暗色主题设计
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 5, 6, 8 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10, 11
  - **Blocked By**: Task 1, 2

  **References**:
  - Tauri v2 拖动：`<div data-tauri-drag-region>`
  - 窗口显示：`getCurrentWebviewWindow().show()`
  - CSS 暗色主题：`background: rgba(20, 20, 30, 0.85); border-radius: 12px; backdrop-filter: blur(12px);`
  - 白闪修复：初始 `visible: false`，DOM ready 后 `show()`
  - Tauri v2 窗口自定义：https://v2.tauri.app/learn/window-customization/

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 悬浮窗 UI 渲染正确
    Tool: Bash (cargo tauri dev + 截图)
    Preconditions: Task 1, 2 已完成
    Steps:
      1. 运行 `cargo tauri dev`
      2. 等待应用启动
      3. 截图验证：暗色背景、圆角、标题栏
      4. 检查标题栏有 data-tauri-drag-region 属性
    Expected Result: 窗口可见，暗色半透明，圆角，标题栏可拖动
    Failure Indicators: 白闪、无 drag region、亮色背景
    Evidence: .omo/evidence/task-7-ui-render.png

  Scenario: 点击展开详情功能
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. 查看默认精简状态
      2. 点击展开区域
      3. 验证显示完整数据
      4. 再次点击折叠
    Expected Result: 可展开/折叠，数据切换正确
    Failure Indicators: 点击无反应、无法折叠
    Evidence: .omo/evidence/task-7-expand.png
  ```

  **Commit**: YES
  - Message: `feat(ui): implement floating widget UI with dark theme`
  - Files: src/App.tsx, src/styles.css, src/main.tsx
  - Pre-commit: `npm run build`

---

- [x] 8. 设置界面 UI

  **What to do**:
  - 创建 `src/Settings.tsx` 实现设置界面
  - 设置项：火山引擎 AK/SK 输入框（password）、DeepSeek API Key 输入框（password）、刷新间隔输入（默认5）、透明度滑块（0.5-1.0，默认0.85）
  - 保存按钮：调用 Tauri command 保存
  - 首次启动检测：无凭证时自动打开设置
  - 暗色主题一致

  **Must NOT do**:
  - 不明文显示密钥
  - 不添加多余设置项

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 前端表单 UI
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 5, 6, 7 并行）
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 12
  - **Blocked By**: Task 1, 2

  **References**:
  - Tauri invoke：`import { invoke } from '@tauri-apps/api/core'`
  - password 输入框：`<input type="password" />`
  - 暗色主题 CSS（与 Task 7 一致）

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 设置界面 UI 渲染
    Tool: Playwright 或 cargo tauri dev + 截图
    Preconditions: Task 1, 2 已完成
    Steps:
      1. 打开设置界面
      2. 截图验证：暗色背景，3 个密码输入框，刷新间隔，透明度滑块，保存按钮
      3. 检查输入框 type 为 password
    Expected Result: 设置界面正确渲染，暗色主题
    Failure Indicators: 亮色背景、密钥可见、缺少输入项
    Evidence: .omo/evidence/task-8-settings-ui.png

  Scenario: 首次启动自动打开设置
    Tool: Bash (cargo tauri dev)
    Preconditions: 无已保存凭证
    Steps:
      1. 清除已保存凭证
      2. 启动应用
      3. 检查设置界面自动显示
    Expected Result: 首次启动时设置界面自动显示
    Failure Indicators: 设置界面不显示
    Evidence: .omo/evidence/task-8-first-launch.txt
  ```

  **Commit**: YES
  - Message: `feat(ui): implement settings window UI`
  - Files: src/Settings.tsx
  - Pre-commit: `npm run build`

---

- [x] 9. 系统托盘 + 开机自启

  **What to do**:
  - 在 `src-tauri/src/lib.rs` 中实现系统托盘
  - 托盘菜单：Show Widget / Settings / Quit
  - 托盘左键点击：切换悬浮窗显示/隐藏
  - 集成 tauri-plugin-autostart 实现开机自启
  - 集成 tauri-plugin-window-state 保存/恢复窗口位置
  - 集成 tauri-plugin-positioner（托盘相对定位）
  - 关闭窗口时隐藏到托盘而非退出

  **Must NOT do**:
  - 不添加多余托盘菜单项
  - 不自定义托盘图标动画

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Tauri 原生集成，多插件配置，需要较高技巧
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 10, 11, 12 并行）
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - Tauri v2 托盘：TrayIconBuilder + Menu + MenuItem
  - autostart 插件：`tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--auto-launch"]))`
  - window-state 插件：`tauri_plugin_window_state::Builder::default().build()`
  - 研究结果中的完整 Rust 代码示例（.omo/drafts/hovermeter.md 第 103-115 行）
  - Tauri v2 系统托盘：https://v2.tauri.app/learn/system-tray/
  - tauri-plugin-autostart：https://v2.tauri.app/plugin/autostart/

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 系统托盘功能
    Tool: Bash (cargo tauri dev)
    Preconditions: Task 1 已完成
    Steps:
      1. 启动应用
      2. 检查系统托盘图标存在
      3. 右键托盘检查菜单：Show Widget / Settings / Quit
      4. 左键点击托盘切换窗口显示/隐藏
      5. 点击 Quit 验证应用退出
    Expected Result: 托盘图标可见，菜单项正确，左键切换，Quit 退出
    Failure Indicators: 无托盘图标、菜单项错误、点击无反应
    Evidence: .omo/evidence/task-9-tray.txt

  Scenario: 开机自启功能
    Tool: Bash
    Preconditions: 应用已构建
    Steps:
      1. 在设置中启用开机自启
      2. 检查 autostart 插件状态：isEnabled() 返回 true
      3. 禁用开机自启
      4. 检查 isEnabled() 返回 false
    Expected Result: 开机自启可启用/禁用，状态正确
    Failure Indicators: isEnabled() 返回错误、状态不切换
    Evidence: .omo/evidence/task-9-autostart.txt
  ```

  **Commit**: YES
  - Message: `feat(tray): implement system tray and autostart`
  - Files: src-tauri/src/lib.rs
  - Pre-commit: `cargo check --manifest-path src-tauri/Cargo.toml`

---

- [x] 10. 数据刷新 + 状态管理集成

  **What to do**:
  - 创建 `src/hooks/useUsageData.ts` 实现数据获取和刷新 hook
  - 使用 setInterval 每 5 分钟（可配置）自动调用 `get_volcano_usage` 和 `get_deepseek_balance` Tauri commands
  - 管理加载状态（loading/error/success）
  - 错误处理：API 失败时显示错误提示，不崩溃
  - 手动刷新按钮（刷新图标）
  - 在 App.tsx 中集成 hook，将数据传递给 UI 组件
  - 初次加载时立即获取数据

  **Must NOT do**:
  - 不做历史数据缓存（只显示当前值）
  - 不添加 WebSocket 实时推送
  - 不过度封装状态管理

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 集成多个模块，状态管理，定时器逻辑
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（依赖 Task 4, 5, 6, 7）
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4, 5, 6, 7

  **References**:
  - Tauri invoke：`import { invoke } from '@tauri-apps/api/core'`
  - React hooks：useState, useEffect, useCallback
  - Task 2 类型定义：src/types/index.ts
  - Task 4 DeepSeek command：`get_deepseek_balance`
  - Task 5 火山引擎 command：`get_volcano_usage`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 自动定时刷新
    Tool: Bash (cargo tauri dev)
    Preconditions: Task 4, 5, 6, 7 已完成，API 密钥已配置
    Steps:
      1. 启动应用
      2. 检查初次加载获取数据
      3. 等待刷新间隔（或修改为短间隔测试）
      4. 检查数据自动刷新
    Expected Result: 初次加载获取数据，定时自动刷新
    Failure Indicators: 不刷新、刷新崩溃、初次不加载
    Evidence: .omo/evidence/task-10-auto-refresh.txt

  Scenario: API 错误处理
    Tool: Bash
    Preconditions: 配置无效的 API 密钥
    Steps:
      1. 在设置中配置无效密钥
      2. 触发数据刷新
      3. 检查 UI 显示错误提示，不崩溃
      4. 修正密钥后刷新，验证恢复正常
    Expected Result: 错误时显示提示不崩溃，修正后恢复
    Failure Indicators: 崩溃、无错误提示、修正后不恢复
    Evidence: .omo/evidence/task-10-error-handling.txt
  ```

  **Commit**: YES
  - Message: `feat(integration): wire data refresh and state management`
  - Files: src/hooks/useUsageData.ts, src/App.tsx
  - Pre-commit: `npm run build`

---

- [x] 11. 窗口拖动 + 位置保存 + 透明度

  **What to do**:
  - 确保 `data-tauri-drag-region` 在标题栏正确工作
  - 集成 tauri-plugin-window-state：窗口移动后自动保存位置，下次启动恢复
  - 实现透明度调节：从设置读取 opacity 值，应用到窗口背景
  - 透明度变化时实时更新 UI
  - 保存窗口位置：onMoved/onResized 事件触发 saveWindowState

  **Must NOT do**:
  - 不添加窗口大小调节（固定尺寸）
  - 不添加多显示器支持（基础位置保存即可）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 前端交互 + 窗口 API 集成
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 9, 10, 12 并行）
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:
  - data-tauri-drag-region 属性（Task 7 已添加）
  - window-state 插件：`saveWindowState(StateFlags.ALL)`
  - 透明度应用：CSS `background: rgba(20, 20, 30, var(--opacity))`
  - tauri-plugin-window-state：https://v2.tauri.app/plugin/window-state/

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 窗口拖动
    Tool: Playwright 或手动
    Preconditions: 应用已启动
    Steps:
      1. 按住标题栏拖动窗口
      2. 验证窗口跟随鼠标移动
      3. 释放后窗口停在当前位置
    Expected Result: 窗口可拖动到任意位置
    Failure Indicators: 无法拖动、拖动卡顿
    Evidence: .omo/evidence/task-11-drag.txt

  Scenario: 窗口位置保存和恢复
    Tool: Bash
    Preconditions: 应用已启动
    Steps:
      1. 拖动窗口到屏幕右下角
      2. 关闭应用（隐藏到托盘）
      3. 重新打开应用
      4. 检查窗口出现在右下角
    Expected Result: 窗口位置在重启后恢复
    Failure Indicators: 窗口回到中心、位置不保存
    Evidence: .omo/evidence/task-11-position-save.txt

  Scenario: 透明度调节
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. 在设置中调整透明度滑块到 0.5
      2. 检查窗口背景透明度变化
      3. 调整到 1.0（不透明）
      4. 检查窗口完全不透明
    Expected Result: 透明度实时变化，范围 0.5-1.0
    Failure Indicators: 透明度不变、超出范围
    Evidence: .omo/evidence/task-11-opacity.png
  ```

  **Commit**: YES
  - Message: `feat(window): implement drag, position save, transparency`
  - Files: src/App.tsx, src/styles.css
  - Pre-commit: `npm run build`

---

- [x] 12. 设置界面逻辑 + 密钥存储

  **What to do**:
  - 在 `src/Settings.tsx` 中实现保存逻辑
  - 保存按钮调用 `invoke('save_credentials', {...})` 和 `invoke('save_settings', {...})` Tauri commands
  - 加载时调用 `invoke('load_credentials')` 和 `invoke('load_settings')` 填充表单
  - 首次启动检测：调用 `invoke('load_credentials')` 返回 None 时自动显示设置
  - 保存成功后关闭设置界面，刷新数据
  - 创建 Tauri commands：`save_credentials`, `load_credentials`, `save_settings`, `load_settings`

  **Must NOT do**:
  - 不在前端存储密钥（通过 Tauri command 传递到后端存储）
  - 不添加密钥验证逻辑（保存即可，使用时验证）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 前后端集成，Tauri command 注册
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（与 Task 9, 10, 11 并行）
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6, 8

  **References**:
  - Task 6 storage 模块：src-tauri/src/storage.rs
  - Task 8 设置 UI：src/Settings.tsx
  - Tauri command 注册：`#[tauri::command]` 宏
  - Tauri invoke：`invoke('save_credentials', { volcanoAk, volcanoSk, deepseekKey })`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 保存和加载凭证
    Tool: Bash (cargo tauri dev)
    Preconditions: Task 6, 8 已完成
    Steps:
      1. 打开设置界面
      2. 输入测试 AK/SK 和 API Key
      3. 点击保存
      4. 关闭设置界面
      5. 重新打开设置界面
      6. 检查输入框已填充保存的值（或显示为已配置状态）
    Expected Result: 凭证可保存、重新加载时可见
    Failure Indicators: 保存失败、加载为空
    Evidence: .omo/evidence/task-12-save-load.txt

  Scenario: 保存后触发数据刷新
    Tool: Bash
    Preconditions: 凭证已保存
    Steps:
      1. 在设置中保存新凭证
      2. 关闭设置界面
      3. 检查主界面自动刷新数据
    Expected Result: 保存后主界面数据刷新
    Failure Indicators: 保存后不刷新
    Evidence: .omo/evidence/task-12-refresh-after-save.txt
  ```

  **Commit**: YES
  - Message: `feat(settings): implement settings logic and credential storage`
  - Files: src/Settings.tsx, src-tauri/src/lib.rs
  - Pre-commit: `cargo check --manifest-path src-tauri/Cargo.toml`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo check` + `cargo build` + `npm run build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: no API key configured, API error, network timeout. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Task 0**: `chore(spike): validate GetPersonalPlan Coding Plan API response` - spike 脚本文件
- **Task 1**: `feat(scaffold): init Tauri v2 project with window config` - src-tauri/, src/, package.json
- **Task 2**: `feat(types): add shared type definitions and data models` - src/types/
- **Task 3**: `feat(auth): implement Volcano Engine V4 signature module` - src-tauri/src/v4_sign.rs
- **Task 4**: `feat(deepseek): implement DeepSeek balance API client` - src-tauri/src/deepseek.rs
- **Task 5**: `feat(volcano): implement Volcano Engine API client` - src-tauri/src/volcano.rs
- **Task 6**: `feat(storage): implement encrypted credential storage` - src-tauri/src/storage.rs
- **Task 7**: `feat(ui): implement floating widget UI with dark theme` - src/App.tsx, src/styles.css
- **Task 8**: `feat(ui): implement settings window UI` - src/Settings.tsx
- **Task 9**: `feat(tray): implement system tray and autostart` - src-tauri/src/lib.rs
- **Task 10**: `feat(integration): wire data refresh and state management` - src/hooks/, src-tauri/src/
- **Task 11**: `feat(window): implement drag, position save, transparency` - src/App.tsx
- **Task 12**: `feat(settings): implement settings logic and credential storage` - src/Settings.tsx, src-tauri/src/

---

## Success Criteria

### Verification Commands
```bash
cd /home/spy/HoverMeter && cargo check --manifest-path src-tauri/Cargo.toml  # Expected: compilation succeeds
cd /home/spy/HoverMeter && npm run build  # Expected: frontend builds successfully
cd /home/spy/HoverMeter && cargo tauri build  # Expected: Windows .exe generated (on Windows)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Tauri v2 项目编译成功
- [ ] 前端构建成功
- [ ] 悬浮窗 UI 正确渲染（暗色、半透明、置顶）
- [ ] 火山引擎 API 数据正确获取和显示
- [ ] DeepSeek API 数据正确获取和显示
- [ ] 系统托盘功能正常
- [ ] 开机自启功能正常
- [ ] 设置界面可配置密钥
- [ ] 5 分钟自动刷新正常
