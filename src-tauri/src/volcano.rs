use serde::{Deserialize, Serialize};

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
    /// Unix timestamp in seconds when the data was last updated
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
    updated_at: i64,
}

#[derive(Debug, Deserialize)]
struct ArkcliPeriod {
    label: String,
    percent: f64,
    reset_at: i64,
}

/// Run `arkcli usage plan` and parse the coding-plan usage data.
///
/// Executes the `arkcli` CLI tool, captures its JSON stdout, and extracts
/// the `coding-plan` item's periods and `updated_at` timestamp.
///
/// # Errors
///
/// Returns `Err(String)` if:
/// - `arkcli` is not installed or not on PATH
/// - The command exits with a non-zero status
/// - stdout is not valid UTF-8
/// - The JSON cannot be parsed
/// - No `coding-plan` item is found in the output
fn query_volcano_usage() -> Result<VolcanoUsage, String> {
    let output = std::process::Command::new("arkcli")
        .args(["usage", "plan"])
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "arkcli is not installed or not found on PATH. \
                 Install it from https://www.volcengine.com/docs/82379"
                    .to_string()
            } else {
                format!("Failed to run arkcli: {}", e)
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "arkcli exited with status {}: {}",
            output.status,
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("arkcli output is not valid UTF-8: {}", e))?;

    let parsed: ArkcliOutput = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse arkcli JSON output: {}", e))?;

    let coding_plan = parsed
        .items
        .into_iter()
        .find(|item| item.product == "coding-plan")
        .ok_or_else(|| {
            "No coding-plan item found in arkcli output. \
             Is your Coding Plan subscription active?"
                .to_string()
        })?;

    let periods = coding_plan
        .periods
        .into_iter()
        .map(|p| PeriodUsage {
            label: p.label,
            percent: p.percent,
            reset_at: p.reset_at,
        })
        .collect();

    Ok(VolcanoUsage {
        periods,
        updated_at: coding_plan.updated_at,
    })
}

/// Tauri command: query Volcano Engine Coding Plan usage via arkcli.
#[tauri::command]
pub fn get_volcano_usage() -> Result<VolcanoUsage, String> {
    query_volcano_usage()
}
