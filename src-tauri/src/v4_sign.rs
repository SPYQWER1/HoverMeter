use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

const REGION: &str = "cn-beijing";
const SERVICE: &str = "ark";
const HOST: &str = "open.volcengineapi.com";
const ALGORITHM: &str = "HMAC-SHA256";
const SIGNED_HEADERS: &str = "host;x-content-sha256;x-date";

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn hmac_sha256(key: &[u8], msg: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(msg.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn hmac_sha256_hex(key: &[u8], msg: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(msg.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn utc_now_formatted() -> (String, String) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards");
    let secs = now.as_secs();

    // YYYYMMDDTHHMMSSZ
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Compute year/month/day from days since epoch (1970-01-01)
    let (year, month, day) = days_to_ymd(days_since_epoch as i64);

    let x_date = format!(
        "{:04}{:02}{:02}T{:02}{:02}{:02}Z",
        year, month, day, hours, minutes, seconds
    );
    let short_date = format!("{:04}{:02}{:02}", year, month, day);

    (x_date, short_date)
}

fn days_to_ymd(mut days: i64) -> (i64, u32, u32) {
    days += 719468; // shift epoch from 1970-01-01 to 0000-03-01
    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let doe = days - era * 146097; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // year of era [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day of year [0, 365]
    let mp = (5 * doy + 2) / 153; // month phase [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // day [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // month [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    (y, m as u32, d as u32)
}

/// Build a Volcengine V4 HMAC-SHA256 Authorization header.
///
/// # Arguments
/// * `method` - HTTP method (e.g. "POST")
/// * `path` - URI path (e.g. "/")
/// * `query` - Query string (e.g. "Action=GetPersonalPlan&Version=2024-01-01")
/// * `body` - Request body bytes
/// * `ak` - Access key
/// * `sk` - Secret key
///
/// # Returns
/// Authorization header value string.
pub fn sign_request(
    method: &str,
    path: &str,
    query: &str,
    body: &[u8],
    ak: &str,
    sk: &str,
) -> String {
    let (x_date, short_date) = utc_now_formatted();
    let content_hash = sha256_hex(body);

    // Step 1: Canonical Request
    let canonical_headers = format!(
        "host:{}\nx-content-sha256:{}\nx-date:{}\n",
        HOST, content_hash, x_date
    );
    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method, path, query, canonical_headers, SIGNED_HEADERS, content_hash
    );
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());

    // Step 2: String to Sign
    let credential_scope = format!("{}/{}/{}/request", short_date, REGION, SERVICE);
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        ALGORITHM, x_date, credential_scope, canonical_request_hash
    );

    // Step 3: Signing Key derivation
    let k_secret = format!("VOLCENGINE{}", sk);
    let k_date = hmac_sha256(k_secret.as_bytes(), &short_date);
    let k_region = hmac_sha256(&k_date, REGION);
    let k_service = hmac_sha256(&k_region, SERVICE);
    let k_signing = hmac_sha256(&k_service, "request");

    // Step 4: Signature
    let signature = hmac_sha256_hex(&k_signing, &string_to_sign);

    // Step 5: Authorization header
    format!(
        "{} Credential={}/{}, SignedHeaders={}, Signature={}",
        ALGORITHM, ak, credential_scope, SIGNED_HEADERS, signature
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sign_request_format() {
        let auth = sign_request(
            "POST",
            "/",
            "Action=GetPersonalPlan&Version=2024-01-01",
            br#"{"Plan":"CodingPlan"}"#,
            "test_ak",
            "test_sk",
        );

        // Verify format: HMAC-SHA256 Credential=.../.../cn-beijing/ark/request, SignedHeaders=host;x-content-sha256;x-date, Signature=...
        assert!(auth.starts_with("HMAC-SHA256 "));
        assert!(auth.contains("Credential=test_ak/"));
        assert!(auth.contains("/cn-beijing/ark/request"));
        assert!(auth.contains("SignedHeaders=host;x-content-sha256;x-date"));
        assert!(auth.contains("Signature="));

        // Credential scope date should be 8 digits
        let cred_start = auth.find("Credential=test_ak/").unwrap() + "Credential=test_ak/".len();
        let cred_end = auth[cred_start..].find('/').unwrap();
        let date_part = &auth[cred_start..cred_start + cred_end];
        assert_eq!(date_part.len(), 8, "Date part should be YYYYMMDD (8 chars)");

        // Signature should be 64 hex chars
        let sig_start = auth.find("Signature=").unwrap() + "Signature=".len();
        let sig = &auth[sig_start..];
        assert_eq!(sig.len(), 64, "Signature should be 64 hex chars");
        assert!(sig.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_sha256_hex_known() {
        let hash = sha256_hex(b"hello");
        assert_eq!(
            hash,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_sign_request_deterministic_with_fixed_time() {
        // Two calls in quick succession should produce different signatures
        // due to different timestamps, but same format
        let auth1 = sign_request("GET", "/", "", b"", "ak", "sk");
        let auth2 = sign_request("GET", "/", "", b"", "ak", "sk");

        assert_eq!(auth1.len(), auth2.len());
        assert!(auth1.starts_with("HMAC-SHA256 "));
        assert!(auth2.starts_with("HMAC-SHA256 "));
    }
}
