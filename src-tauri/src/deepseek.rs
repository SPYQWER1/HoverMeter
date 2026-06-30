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

/// Query the DeepSeek balance API.
///
/// Sends a GET request to `https://api.deepseek.com/user/balance` with
/// `Authorization: Bearer {api_key}` and returns the parsed response.
///
/// # Errors
///
/// Returns `Err` if:
/// - The API key is empty
/// - The HTTP request fails (network error, non-200 status)
/// - The response body cannot be parsed as JSON
pub async fn get_balance(api_key: &str) -> Result<DeepSeekBalance, String> {
    if api_key.is_empty() {
        log::warn!("DeepSeek API key is empty");
        return Err("API 密钥不能为空".to_string());
    }

    log::info!("Fetching DeepSeek balance");

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
