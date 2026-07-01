//! DeepSeek API 余额查询模块
//!
//! 通过 HTTP GET 请求 `https://api.deepseek.com/user/balance`，
//! 使用 Bearer Token 认证，解析返回的账户余额信息。

use serde::{Deserialize, Serialize};

/// DeepSeek 余额查询的顶层响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepSeekBalance {
    /// 账户是否可用
    #[serde(rename = "is_available")]
    pub is_available: bool,
    /// 各币种余额列表
    #[serde(rename = "balance_infos")]
    pub balance_infos: Vec<BalanceInfo>,
}

/// 单个币种的余额信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceInfo {
    /// 货币代码，如 "CNY"
    pub currency: String,
    /// 总余额（字符串形式以保持精度）
    #[serde(rename = "total_balance")]
    pub total_balance: String,
    /// 赠送余额
    #[serde(rename = "granted_balance")]
    pub granted_balance: String,
    /// 充值余额
    #[serde(rename = "topped_up_balance")]
    pub topped_up_balance: String,
}

/// 最大重试次数
const MAX_RETRIES: u32 = 3;
/// 重试间隔（毫秒）
const RETRY_DELAY_MS: u64 = 800;

/// 查询 DeepSeek 余额（带重试逻辑）。
///
/// 对网络临时错误最多重试 MAX_RETRIES 次。
/// 对永久性错误（空 API Key、HTTP 401/403）不重试。
///
/// # 错误
///
/// 返回 `Err` 的情况：
/// - API Key 为空
/// - HTTP 请求失败（重试耗尽后）
/// - 响应体无法解析为 JSON
pub async fn get_balance(api_key: &str) -> Result<DeepSeekBalance, String> {
    let mut last_error: Option<String> = None;

    for attempt in 1..=MAX_RETRIES {
        log::info!(
            "Fetching DeepSeek balance (attempt {attempt}/{MAX_RETRIES})"
        );

        match try_get_balance(api_key).await {
            Ok(balance) => return Ok(balance),
            Err(e) => {
                log::warn!("DeepSeek balance fetch attempt {attempt} failed: {e}");
                last_error = Some(e.clone());

                if is_permanent_error(&e) {
                    break;
                }

                if attempt < MAX_RETRIES {
                    tokio::time::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS))
                        .await;
                }
            }
        }
    }

    let err = last_error.unwrap_or_else(|| "未知错误".to_string());
    log::error!("DeepSeek balance fetch failed after {MAX_RETRIES} attempts: {err}");
    Err(err)
}

/// 判断错误是否为永久性错误（不应重试）。
fn is_permanent_error(error: &str) -> bool {
    error.contains("API 密钥不能为空")
        || error.contains("HTTP 401")
        || error.contains("HTTP 403")
}

/// 单次尝试：发送 HTTP 请求、检查状态码、解析 JSON 响应。
async fn try_get_balance(api_key: &str) -> Result<DeepSeekBalance, String> {
    if api_key.is_empty() {
        log::warn!("DeepSeek API key is empty");
        return Err("API 密钥不能为空".to_string());
    }

    let client = reqwest::Client::new();

    let response = client
        .get("https://api.deepseek.com/user/balance")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| {
            let msg = format!("HTTP 请求失败: {}", e);
            log::error!("{msg}");
            msg
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let msg = format!("DeepSeek API 返回 HTTP {}: {}", status, body);
        log::error!("{msg}");
        return Err(msg);
    }

    let balance: DeepSeekBalance = response
        .json()
        .await
        .map_err(|e| {
            let msg = format!("解析 DeepSeek 响应失败: {}", e);
            log::error!("{msg}");
            msg
        })?;

    log::info!("DeepSeek balance fetched successfully");

    Ok(balance)
}

/// Tauri 命令：查询 DeepSeek 余额。
#[tauri::command]
pub async fn get_deepseek_balance(api_key: String) -> Result<DeepSeekBalance, String> {
    log::info!("get_deepseek_balance command invoked");
    get_balance(&api_key).await
}
