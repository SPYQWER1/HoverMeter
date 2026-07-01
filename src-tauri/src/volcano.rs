use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// One period of usage data (session, weekly, or monthly).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodUsage {
    /// Period label: "session", "weekly", or "monthly"
    pub label: String,
    /// Usage percentage (0.0–100.0)
    pub percent: f64,
    /// Unix timestamp in milliseconds when this period resets
    pub reset_at: i64,
}

/// Volcano Engine Coding Plan usage summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolcanoUsage {
    /// Usage periods (session, weekly, monthly)
    pub periods: Vec<PeriodUsage>,
    /// Unix timestamp in milliseconds when the data was fetched by this app
    pub updated_at: i64,
}

// ── Private deserialization helpers for arkcli JSON ──

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

const MAX_RETRIES: u32 = 3;
const RETRY_DELAY_MS: u64 = 800;

/// Run `arkcli usage plan` and parse the coding-plan usage data.
///
/// Executes the `arkcli` CLI tool, captures its JSON stdout, and extracts
/// the `coding-plan` item's periods and `updated_at` timestamp.
///
/// Retries transient failures (e.g. temporary auth/STS errors) a few times
/// before giving up. Does not retry if `arkcli` itself is missing.
///
/// # Errors
///
/// Returns `Err(String)` if:
/// - `arkcli` is not installed or not on PATH
/// - The command exits with a non-zero status after all retries
/// - stdout is not valid UTF-8
/// - The JSON cannot be parsed
/// - No `coding-plan` item is found in the output
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

                // If arkcli is not installed, retrying won't help.
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

/// Return a user-facing error string for a failed `arkcli` invocation.
fn friendly_arkcli_error(status: std::process::ExitStatus, stderr: &str) -> String {
    format!("arkcli 退出，状态码 {}: {}", status, stderr.trim())
}

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

#[cfg(not(target_os = "windows"))]
fn run_arkcli_usage_plan() -> Result<std::process::Output, std::io::Error> {
    std::process::Command::new("arkcli")
        .args(["usage", "plan"])
        .output()
}

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
