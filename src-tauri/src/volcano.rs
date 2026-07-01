//! 火山引擎用量查询模块
//!
//! 通过 `arkcli usage plan` 子进程获取 Coding Plan 用量数据。
//! 解析 JSON 输出，提取 session/weekly/monthly 三个周期的用量百分比。

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// 单个用量周期（session / weekly / monthly）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodUsage {
    /// 周期标签："session"、"weekly" 或 "monthly"
    pub label: String,
    /// 用量百分比（0.0–100.0）
    pub percent: f64,
    /// 本周期重置时间的 Unix 毫秒时间戳
    pub reset_at: i64,
}

/// 火山引擎 Coding Plan 用量摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolcanoUsage {
    /// 用量周期列表
    pub periods: Vec<PeriodUsage>,
    /// 数据获取时间的 Unix 毫秒时间戳（由本应用记录）
    pub updated_at: i64,
}

// ── arkcli JSON 反序列化辅助结构体 ──

#[derive(Debug, Deserialize)]
struct ArkcliOutput {
    items: Vec<ArkcliItem>,
}

#[derive(Debug, Deserialize)]
struct ArkcliItem {
    product: String,
    periods: Vec<ArkcliPeriod>,
}

#[derive(Debug, Deserialize)]
struct ArkcliPeriod {
    label: String,
    percent: f64,
    reset_at: i64,
}

/// 最大重试次数
const MAX_RETRIES: u32 = 3;
/// 重试间隔（毫秒）
const RETRY_DELAY_MS: u64 = 800;

/// 运行 `arkcli usage plan` 并解析 Coding Plan 用量数据。
///
/// 带重试机制：对临时性错误（如 STS 认证过期）最多重试 MAX_RETRIES 次。
/// `arkcli` 未安装时不重试，直接返回错误。
///
/// # 错误
///
/// 返回 `Err(String)` 的情况：
/// - `arkcli` 未安装或不在 PATH 中
/// - 命令以非零状态码退出（重试耗尽后）
/// - stdout 不是有效的 UTF-8
/// - JSON 无法解析
/// - 输出中找不到 `coding-plan` 项目
fn query_volcano_usage() -> Result<VolcanoUsage, String> {
    let mut last_error: Option<String> = None;

    for attempt in 1..=MAX_RETRIES {
        log::info!(
            "Fetching Volcano Engine usage via arkcli (attempt {attempt}/{MAX_RETRIES})"
        );

        match try_query_volcano_usage() {
            Ok(usage) => return Ok(usage),
            Err(e) => {
                log::warn!("Volcano usage fetch attempt {attempt} failed: {e}");
                last_error = Some(e.clone());

                // arkcli 未安装时重试无意义
                if e.contains("未安装") {
                    break;
                }

                if attempt < MAX_RETRIES {
                    std::thread::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS));
                }
            }
        }
    }

    let err = last_error.unwrap_or_else(|| "未知错误".to_string());
    log::error!("Volcano usage fetch failed after {MAX_RETRIES} attempts: {err}");
    Err(err)
}

/// 单次尝试：执行 arkcli、解析输出、构造 VolcanoUsage。
fn try_query_volcano_usage() -> Result<VolcanoUsage, String> {
    let output = run_arkcli_usage_plan().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "arkcli 未安装或不在 PATH 中，请从 https://www.volcengine.com/docs/82379 安装"
                .to_string()
        } else {
            format!("运行 arkcli 失败: {}", e)
        }
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(friendly_arkcli_error(output.status, &stderr));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("arkcli 输出不是有效的 UTF-8: {}", e))?;

    let parsed: ArkcliOutput = serde_json::from_str(&stdout)
        .map_err(|e| format!("解析 arkcli JSON 输出失败: {}", e))?;

    let coding_plan = parsed
        .items
        .into_iter()
        .find(|item| item.product == "coding-plan")
        .ok_or_else(|| {
            "未在 arkcli 输出中找到 coding-plan 项目，Coding Plan 订阅是否有效？"
                .to_string()
        })?;

    let periods: Vec<PeriodUsage> = coding_plan
        .periods
        .into_iter()
        .map(|p| PeriodUsage {
            label: p.label,
            percent: p.percent,
            reset_at: p.reset_at,
        })
        .collect();

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    log::info!("Volcano usage fetched successfully ({} periods)", periods.len());

    Ok(VolcanoUsage {
        periods,
        updated_at: now_ms,
    })
}

/// 将 arkcli 退出状态和 stderr 拼接为用户友好的错误信息。
fn friendly_arkcli_error(status: std::process::ExitStatus, stderr: &str) -> String {
    format!("arkcli 退出，状态码 {}: {}", status, stderr.trim())
}

/// 判断 stderr 输出是否为认证错误（SSO Token 过期等）。
#[allow(dead_code)]
fn stderr_looks_like_auth_error(stderr: &str) -> bool {
    stderr.contains("volc-sso")
        || stderr.contains("STS 续期失败")
        || stderr.contains("token 交换失败")
}

/// Windows 平台：使用 CREATE_NO_WINDOW 标志运行 arkcli，避免弹出控制台窗口。
///
/// 先尝试直接调用 arkcli，失败时通过 `cmd /c` 回退。
#[cfg(target_os = "windows")]
fn run_arkcli_usage_plan() -> Result<std::process::Output, std::io::Error> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    match std::process::Command::new("arkcli")
        .args(["usage", "plan"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) => return Ok(output),
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
        Err(_) => {}
    }

    let output = std::process::Command::new("cmd")
        .args(["/c", "arkcli", "usage", "plan"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;

    const CMD_NOT_FOUND: i32 = 9009;
    if !output.status.success() && output.status.code() == Some(CMD_NOT_FOUND) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "arkcli not found",
        ));
    }

    Ok(output)
}

/// 非 Windows 平台：直接运行 arkcli。
#[cfg(not(target_os = "windows"))]
fn run_arkcli_usage_plan() -> Result<std::process::Output, std::io::Error> {
    std::process::Command::new("arkcli")
        .args(["usage", "plan"])
        .output()
}

/// Tauri 命令：获取火山引擎用量数据。
///
/// 在阻塞线程池中执行，避免阻塞异步运行时。
#[tauri::command]
pub async fn get_volcano_usage() -> Result<VolcanoUsage, String> {
    log::info!("get_volcano_usage command invoked");
    tokio::task::spawn_blocking(query_volcano_usage)
        .await
        .map_err(|e| {
            let msg = format!("arkcli 任务失败: {e}");
            log::error!("{msg}");
            msg
        })?
}

#[cfg(test)]
mod tests {
    use super::stderr_looks_like_auth_error;

    #[test]
    fn detects_sso_token_expiration() {
        let stderr = "ListSubscribeTrade requires Volc SSO STS, please run `arkcli auth login volc-sso`: identity volc-123 STS 续期失败: token 交换失败: invalid_request - The request parameter refresh token is invalid.";
        assert!(stderr_looks_like_auth_error(stderr));
    }

    #[test]
    fn ignores_unrelated_errors() {
        assert!(!stderr_looks_like_auth_error("network timeout"));
        assert!(!stderr_looks_like_auth_error("unknown command: foo"));
    }
}
