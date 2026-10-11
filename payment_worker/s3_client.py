import datetime
import hashlib
import hmac
import os
import urllib.parse
import urllib.request
from typing import Optional


def _hmac_sha256(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download_s3_object(object_key: str, dest_path: str) -> bool:
    bucket = os.getenv("S3_BUCKET", "boreal-storage")
    region = os.getenv("S3_REGION", "us-east-1")
    endpoint = (os.getenv("S3_ENDPOINT") or "http://127.0.0.1:9000").strip().rstrip("/")
    access_key = os.getenv("S3_ACCESS_KEY_ID", "boreal_s3_access")
    secret_key = os.getenv("S3_SECRET_ACCESS_KEY", "boreal_s3_secret_2026")
    force_path_style = os.getenv("S3_FORCE_PATH_STYLE", "true").lower() != "false"

    clean_key = object_key.lstrip("/")
    if not endpoint:
        base_url = f"https://s3.{region}.amazonaws.com"
    elif not endpoint.startswith("http"):
        base_url = f"https://{endpoint}"
    else:
        base_url = endpoint

    parsed_base = urllib.parse.urlparse(base_url)
    quoted_key = "/".join(urllib.parse.quote(part, safe="-_.~") for part in clean_key.split("/"))

    if force_path_style:
        host_header = parsed_base.netloc
        canonical_uri = f"/{urllib.parse.quote(bucket, safe='-_.~')}/{quoted_key}"
        target_url = f"{parsed_base.scheme}://{host_header}{canonical_uri}"
    else:
        host_header = f"{bucket}.{parsed_base.netloc}"
        canonical_uri = f"/{quoted_key}"
        target_url = f"{parsed_base.scheme}://{host_header}{canonical_uri}"

    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    payload_hash = _sha256_hex(b"")

    canonical_headers = (
        f"host:{host_header}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join([
        "GET",
        canonical_uri,
        "",
        canonical_headers,
        signed_headers,
        payload_hash,
    ])

    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        _sha256_hex(canonical_request.encode("utf-8")),
    ])

    k_date = _hmac_sha256(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    k_region = _hmac_sha256(k_date, region)
    k_service = _hmac_sha256(k_region, "s3")
    k_signing = _hmac_sha256(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    authorization = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    req = urllib.request.Request(
        target_url,
        headers={
            "Authorization": authorization,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                data: Optional[bytes] = resp.read()
                if data:
                    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                    with open(dest_path, "wb") as f:
                        f.write(data)
                    return True
    except Exception:
        return False

    return False
