#!/usr/bin/env python3
"""
Spike: Call Volcengine GetPersonalPlan(Plan="CodingPlan") API with V4 signature.

Usage:
    VOLCENGINE_ACCESS_KEY=xxx VOLCENGINE_SECRET_KEY=yyy python3 get_personal_plan.py

Output: prints JSON response to stdout, saves to .omo/evidence/task-0-spike-response.json
"""

import hashlib
import hmac
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone


# --- V4 Signature Constants ---
REGION = "cn-beijing"
SERVICE = "ark"
HOST = "open.volcengineapi.com"
ENDPOINT = f"https://{HOST}/?Action=GetPersonalPlan&Version=2024-01-01"
REQUEST_BODY = json.dumps({"Plan": "CodingPlan"}, separators=(",", ":"))
METHOD = "POST"
ALGORITHM = "HMAC-SHA256"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hmac_sha256(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def build_v4_headers(access_key: str, secret_key: str) -> dict:
    now = datetime.now(timezone.utc)
    x_date = now.strftime("%Y%m%dT%H%M%SZ")
    short_date = now.strftime("%Y%m%d")

    content_hash = sha256_hex(REQUEST_BODY.encode("utf-8"))

    # Step 1: Canonical Request
    canonical_uri = "/"
    canonical_query = "Action=GetPersonalPlan&Version=2024-01-01"
    canonical_headers = (
        f"host:{HOST}\n"
        f"x-content-sha256:{content_hash}\n"
        f"x-date:{x_date}\n"
    )
    signed_headers = "host;x-content-sha256;x-date"
    canonical_request = (
        f"{METHOD}\n"
        f"{canonical_uri}\n"
        f"{canonical_query}\n"
        f"{canonical_headers}\n"
        f"{signed_headers}\n"
        f"{content_hash}"
    )
    canonical_request_hash = sha256_hex(canonical_request.encode("utf-8"))

    # Step 2: String to Sign
    credential_scope = f"{short_date}/{REGION}/{SERVICE}/request"
    string_to_sign = (
        f"{ALGORITHM}\n"
        f"{x_date}\n"
        f"{credential_scope}\n"
        f"{canonical_request_hash}"
    )

    # Step 3: Signing Key
    k_date = hmac_sha256(("VOLCENGINE" + secret_key).encode("utf-8"), short_date)
    k_region = hmac_sha256(k_date, REGION)
    k_service = hmac_sha256(k_region, SERVICE)
    k_signing = hmac_sha256(k_service, "request")

    # Step 4: Signature
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    authorization = (
        f"{ALGORITHM} Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    return {
        "Host": HOST,
        "X-Date": x_date,
        "X-Content-Sha256": content_hash,
        "Authorization": authorization,
        "Content-Type": "application/json",
    }


def call_api(access_key: str, secret_key: str) -> dict:
    headers = build_v4_headers(access_key, secret_key)

    req = urllib.request.Request(
        ENDPOINT,
        data=REQUEST_BODY.encode("utf-8"),
        headers=headers,
        method=METHOD,
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
            return {"status": status, "body": json.loads(body)}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        return {"status": e.code, "body": json.loads(error_body) if error_body else {"error": error_body}}
    except urllib.error.URLError as e:
        return {"status": 0, "body": {"error": str(e.reason)}}


def main():
    access_key = os.environ.get("VOLCENGINE_ACCESS_KEY")
    secret_key = os.environ.get("VOLCENGINE_SECRET_KEY")

    if not access_key or not secret_key:
        print("ERROR: VOLCENGINE_ACCESS_KEY and VOLCENGINE_SECRET_KEY must be set", file=sys.stderr)
        sys.exit(1)

    result = call_api(access_key, secret_key)

    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "evidence",
        "task-0-spike-response.json",
    )
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\nResponse saved to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
