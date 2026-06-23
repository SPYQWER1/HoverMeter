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
        return Err("API key must not be empty".to_string());
    }

    let client = reqwest::Client::new();

    let response = client
        .get("https://api.deepseek.com/user/balance")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "DeepSeek API returned HTTP {}: {}",
            status, body
        ));
    }

    let balance: DeepSeekBalance = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse DeepSeek response: {}", e))?;

    Ok(balance)
}

/// Tauri command: query DeepSeek balance.
#[tauri::command]
pub async fn get_deepseek_balance(api_key: String) -> Result<DeepSeekBalance, String> {
    get_balance(&api_key).await
}
