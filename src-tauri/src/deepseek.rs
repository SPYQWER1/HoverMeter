use serde::{Deserialize, Serialize};

/// Top-level response from GET https://api.deepseek.com/user/balance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepSeekBalance {
    /// Whether the account is available
    #[serde(rename = "is_available")]
    pub is_available: bool,
    /// List of balance information per currency
    #[serde(rename = "balance_infos")]
    pub balance_infos: Vec<BalanceInfo>,
}

/// Balance information for a specific currency
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceInfo {
    /// Currency code, e.g. "CNY"
    pub currency: String,
    /// Total balance as a string to preserve precision
    #[serde(rename = "total_balance")]
    pub total_balance: String,
    /// Granted (free) balance
    #[serde(rename = "granted_balance")]
    pub granted_balance: String,
    /// Topped-up (purchased) balance
    #[serde(rename = "topped_up_balance")]
    pub topped_up_balance: String,
}

const MAX_RETRIES: u32 = 3;
const RETRY_DELAY_MS: u64 = 800;

/// Query the DeepSeek balance API with retry logic.
///
/// Sends a GET request to `https://api.deepseek.com/user/balance` with
/// `Authorization: Bearer {api_key}` and returns the parsed response.
///
/// Retries transient failures up to `MAX_RETRIES` times with a delay.
/// Does not retry permanent errors (empty API key, HTTP 401/403).
///
/// # Errors
///
/// Returns `Err` if:
/// - The API key is empty
/// - The HTTP request fails after all retries (network error, non-200 status)
/// - The response body cannot be parsed as JSON
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

fn is_permanent_error(error: &str) -> bool {
    error.contains("API 密钥不能为空")
        || error.contains("HTTP 401")
        || error.contains("HTTP 403")
}

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

/// Tauri command: query DeepSeek balance.
#[tauri::command]
pub async fn get_deepseek_balance(api_key: String) -> Result<DeepSeekBalance, String> {
    log::info!("get_deepseek_balance command invoked");
    get_balance(&api_key).await
}
