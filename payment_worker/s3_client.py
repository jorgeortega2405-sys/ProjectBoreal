import datetime
import hashlib
import hmac
import os
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional


def _hmac_sha256(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _get_s3_config() -> Dict[str, Any]:
    bucket = os.getenv("S3_BUCKET", "boreal-storage")
    region = os.getenv("S3_REGION", "us-east-1")
    endpoint = (os.getenv("S3_ENDPOINT") or "http://127.0.0.1:9000").strip().rstrip("/")
    access_key = os.getenv("S3_ACCESS_KEY_ID", "boreal_s3_access")
    secret_key = os.getenv("S3_SECRET_ACCESS_KEY", "boreal_s3_secret_2026")
    force_path_style = os.getenv("S3_FORCE_PATH_STYLE", "true").lower() != "false"

    if not endpoint:
        base_url = f"https://s3.{region}.amazonaws.com"
    elif not endpoint.startswith("http"):
        base_url = f"https://{endpoint}"
    else:
        base_url = endpoint

    return {
        "bucket": bucket,
        "region": region,
        "base_url": base_url,
        "access_key": access_key,
        "secret_key": secret_key,
        "force_path_style": force_path_style,
    }


def _build_sigv4_request(
    method: str,
    object_key: str = "",
    query_params: Optional[Dict[str, str]] = None,
    payload: bytes = b"",
    content_type: Optional[str] = None,
) -> urllib.request.Request:
    cfg = _get_s3_config()
    parsed_base = urllib.parse.urlparse(cfg["base_url"])
    clean_key = object_key.lstrip("/")

    if cfg["force_path_style"]:
        host_header = parsed_base.netloc
        if clean_key:
            quoted_key = "/".join(urllib.parse.quote(part, safe="-_.~") for part in clean_key.split("/"))
            canonical_uri = f"/{urllib.parse.quote(cfg['bucket'], safe='-_.~')}/{quoted_key}"
        else:
            canonical_uri = f"/{urllib.parse.quote(cfg['bucket'], safe='-_.~')}"
    else:
        host_header = f"{cfg['bucket']}.{parsed_base.netloc}"
        if clean_key:
            quoted_key = "/".join(urllib.parse.quote(part, safe="-_.~") for part in clean_key.split("/"))
            canonical_uri = f"/{quoted_key}"
        else:
            canonical_uri = "/"

    canonical_query = ""
    target_url = f"{parsed_base.scheme}://{host_header}{canonical_uri}"
    if query_params:
        sorted_params = sorted(query_params.items())
        canonical_query = "&".join(
            f"{urllib.parse.quote(k, safe='-_.~')}={urllib.parse.quote(v, safe='-_.~')}"
            for k, v in sorted_params
        )
        target_url = f"{target_url}?{canonical_query}"

    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    payload_hash = _sha256_hex(payload)

    headers_dict = {
        "host": host_header,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if content_type:
        headers_dict["content-type"] = content_type

    sorted_header_keys = sorted(headers_dict.keys())
    canonical_headers = "".join(f"{k}:{headers_dict[k]}\n" for k in sorted_header_keys)
    signed_headers = ";".join(sorted_header_keys)

    canonical_request = "\n".join([
        method,
        canonical_uri,
        canonical_query,
        canonical_headers,
        signed_headers,
        payload_hash,
    ])

    credential_scope = f"{date_stamp}/{cfg['region']}/s3/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        _sha256_hex(canonical_request.encode("utf-8")),
    ])

    k_date = _hmac_sha256(("AWS4" + cfg["secret_key"]).encode("utf-8"), date_stamp)
    k_region = _hmac_sha256(k_date, cfg["region"])
    k_service = _hmac_sha256(k_region, "s3")
    k_signing = _hmac_sha256(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    auth_header = (
        f"AWS4-HMAC-SHA256 Credential={cfg['access_key']}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    request_headers = {
        "Authorization": auth_header,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if content_type:
        request_headers["Content-Type"] = content_type

    req_data = payload if method in ("PUT", "POST") else None
    return urllib.request.Request(target_url, data=req_data, headers=request_headers, method=method)


def download_s3_bytes(object_key: str) -> Optional[bytes]:
    try:
        req = _build_sigv4_request("GET", object_key=object_key)
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                return resp.read()
    except Exception:
        return None
    return None


def download_s3_object(object_key: str, dest_path: str) -> bool:
    try:
        data = download_s3_bytes(object_key)
        if data is not None:
            os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
            with open(dest_path, "wb") as f:
                f.write(data)
            return True
    except Exception:
        return False
    return False


def upload_s3_bytes(object_key: str, data: bytes, content_type: str = "application/octet-stream") -> bool:
    try:
        req = _build_sigv4_request("PUT", object_key=object_key, payload=data, content_type=content_type)
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False


def upload_s3_file(object_key: str, source_path: str, content_type: str = "application/octet-stream") -> bool:
    try:
        with open(source_path, "rb") as f:
            data = f.read()
        return upload_s3_bytes(object_key, data, content_type=content_type)
    except Exception:
        return False


def delete_s3_object(object_key: str) -> bool:
    try:
        req = _build_sigv4_request("DELETE", object_key=object_key)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False


def list_s3_objects(prefix: str = "") -> List[Dict[str, Any]]:
    query_params = {"list-type": "2"}
    if prefix:
        query_params["prefix"] = prefix
    try:
        req = _build_sigv4_request("GET", object_key="", query_params=query_params)
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                return []
            xml_data = resp.read()
            root = ET.fromstring(xml_data)
            ns = "{http://s3.amazonaws.com/doc/2006-03-01/}"
            results: List[Dict[str, Any]] = []
            for item in root.findall(f"{ns}Contents"):
                key_node = item.find(f"{ns}Key")
                size_node = item.find(f"{ns}Size")
                modified_node = item.find(f"{ns}LastModified")
                etag_node = item.find(f"{ns}ETag")
                if key_node is not None and key_node.text:
                    results.append({
                        "key": key_node.text,
                        "size": int(size_node.text) if size_node is not None and size_node.text else 0,
                        "last_modified": modified_node.text if modified_node is not None and modified_node.text else "",
                        "etag": (etag_node.text or "").strip('"'),
                    })
            return results
    except Exception:
        return []
