import argparse
import datetime
import decimal
import hashlib
import json
import os
import shutil
import socket
import struct
import sys
import tarfile
import time
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple

import pymysql
import redis

import s3_client


class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj: Any) -> Any:
        if isinstance(obj, (datetime.datetime, datetime.date, datetime.time)):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (bytes, bytearray)):
            try:
                return obj.decode("utf-8")
            except Exception:
                return obj.hex()
        return super().default(obj)


class CassandraPureClient:
    def __init__(self, host: str = "127.0.0.1", port: int = 9042):
        self.host = host
        self.port = port
        self.sock: Optional[socket.socket] = None
        self.stream_id = 1

    def connect(self) -> bool:
        try:
            self.sock = socket.create_connection((self.host, self.port), timeout=10)
            body = struct.pack(">H", 1) + struct.pack(">H", 11) + b"CQL_VERSION" + struct.pack(">H", 5) + b"3.0.0"
            hdr = bytes([0x04, 0x00, 0x00, 0x01, 0x01]) + struct.pack(">i", len(body))
            self.sock.sendall(hdr + body)
            self._recv_frame()
            return True
        except Exception:
            return False

    def _recv_frame(self) -> Tuple[int, bytes]:
        if not self.sock:
            raise ConnectionError("Cassandra client not connected")
        hdr = b""
        while len(hdr) < 9:
            chunk = self.sock.recv(9 - len(hdr))
            if not chunk:
                raise ConnectionError("Cassandra connection closed")
            hdr += chunk
        v, flags, stream, opcode, length = struct.unpack(">BBhbi", hdr)
        body = b""
        while len(body) < length:
            chunk = self.sock.recv(length - len(body))
            if not chunk:
                raise ConnectionError("Truncated Cassandra body")
            body += chunk
        return opcode, body

    def query(self, cql_str: str) -> Tuple[int, bytes]:
        if not self.sock:
            raise ConnectionError("Cassandra client not connected")
        cql_bytes = cql_str.encode("utf-8")
        body = struct.pack(">i", len(cql_bytes)) + cql_bytes + struct.pack(">H", 0x0001) + bytes([0])
        self.stream_id = (self.stream_id + 1) & 0x7FFF
        hdr = bytes([0x04, 0x00, (self.stream_id >> 8) & 0xFF, self.stream_id & 0xFF, 0x07]) + struct.pack(">i", len(body))
        self.sock.sendall(hdr + body)
        return self._recv_frame()

    def query_json_rows(self, cql_str: str) -> List[Dict[str, Any]]:
        opcode, body = self.query(cql_str)
        if opcode != 0x08:
            return []
        kind = struct.unpack(">i", body[0:4])[0]
        if kind != 2:
            return []
        flags, col_count = struct.unpack(">ii", body[4:12])
        pos = 12
        if (flags & 0x0001) == 0:
            ks_len = struct.unpack(">H", body[pos:pos+2])[0]
            pos += 2 + ks_len
            tbl_len = struct.unpack(">H", body[pos:pos+2])[0]
            pos += 2 + tbl_len
        for _ in range(col_count):
            if flags & 0x0001:
                ks_len = struct.unpack(">H", body[pos:pos+2])[0]
                pos += 2 + ks_len
                tbl_len = struct.unpack(">H", body[pos:pos+2])[0]
                pos += 2 + tbl_len
            col_len = struct.unpack(">H", body[pos:pos+2])[0]
            pos += 2 + col_len
            col_type = struct.unpack(">H", body[pos:pos+2])[0]
            pos += 2
        row_count = struct.unpack(">i", body[pos:pos+4])[0]
        pos += 4
        rows = []
        for _ in range(row_count):
            val_len = struct.unpack(">i", body[pos:pos+4])[0]
            pos += 4
            if val_len > 0:
                raw_str = body[pos:pos+val_len].decode("utf-8", errors="replace")
                pos += val_len
                try:
                    rows.append(json.loads(raw_str))
                except Exception:
                    pass
        return rows

    def execute_insert_json(self, table_name: str, json_str: str) -> bool:
        escaped_json = json_str.replace("'", "''")
        cql = f"INSERT INTO {table_name} JSON '{escaped_json}';"
        opcode, body = self.query(cql)
        return opcode in (0x02, 0x08)

    def close(self) -> None:
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None


def get_mysql_connection() -> pymysql.Connection:
    host = os.getenv("DB_HOST", "127.0.0.1")
    port = int(os.getenv("DB_PORT", "3306"))
    user = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD", "sprite_password")
    database = os.getenv("DB_NAME", "db_lottery")

    try:
        return pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset="utf8mb4",
            autocommit=True,
            cursorclass=pymysql.cursors.DictCursor,
        )
    except Exception:
        return pymysql.connect(
            host=host,
            port=port,
            user="root",
            password="sprite_password",
            database=database,
            charset="utf8mb4",
            autocommit=True,
            cursorclass=pymysql.cursors.DictCursor,
        )


def get_redis_connection() -> redis.Redis:
    host = os.getenv("REDIS_HOST", "127.0.0.1")
    port = int(os.getenv("REDIS_PORT", "6379"))
    password = os.getenv("REDIS_PASSWORD", "boreal_redis_auth_key_2026!")
    return redis.Redis(host=host, port=port, password=password, decode_responses=False)


def get_cassandra_connection() -> CassandraPureClient:
    host = os.getenv("CASSANDRA_CONTACT_POINTS", "127.0.0.1")
    port = int(os.getenv("CASSANDRA_PORT", "9042"))
    client = CassandraPureClient(host=host, port=port)
    client.connect()
    return client


def inspect_live_inventory() -> Dict[str, Any]:
    inventory: Dict[str, Any] = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mysql": {"status": "offline", "tables": []},
        "cassandra": {"status": "offline", "keyspace": "boreal_audit", "tables": []},
        "s3": {"status": "offline", "bucket": os.getenv("S3_BUCKET", "boreal-storage"), "prefixes": [], "total_objects": 0, "total_size_bytes": 0},
        "redis": {"status": "offline", "key_count": 0, "memory_used_human": ""},
    }

    try:
        conn = get_mysql_connection()
        with conn.cursor() as cur:
            cur.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
            table_rows = cur.fetchall()
            db_name = os.getenv("DB_NAME", "db_lottery")
            table_key = f"Tables_in_{db_name}"

            tables_info = []
            for row in table_rows:
                t_name = row.get(table_key) or list(row.values())[0]
                cur.execute(f"SELECT COUNT(*) AS cnt FROM `{t_name}`")
                cnt = cur.fetchone()["cnt"]

                cur.execute(
                    "SELECT COLUMN_NAME, DATA_TYPE, EXTRA "
                    "FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
                    (db_name, t_name),
                )
                columns = cur.fetchall()
                gen_cols = [c["COLUMN_NAME"] for c in columns if "GENERATED" in (c.get("EXTRA") or "").upper() or "VIRTUAL" in (c.get("EXTRA") or "").upper()]

                tables_info.append({
                    "name": t_name,
                    "row_count": cnt,
                    "columns_count": len(columns),
                    "generated_columns": gen_cols,
                })

            inventory["mysql"] = {
                "status": "healthy",
                "database": db_name,
                "tables": sorted(tables_info, key=lambda x: x["name"]),
                "total_tables": len(tables_info),
                "total_rows": sum(t["row_count"] for t in tables_info),
            }
        conn.close()
    except Exception as e:
        inventory["mysql"]["error"] = str(e)

    try:
        cass = get_cassandra_connection()
        table_rows = cass.query_json_rows("SELECT JSON table_name FROM system_schema.tables WHERE keyspace_name = 'boreal_audit';")
        cass_tables = []
        for r in table_rows:
            tbl = r.get("table_name")
            if tbl:
                count_rows = cass.query_json_rows(f"SELECT JSON COUNT(*) FROM boreal_audit.{tbl};")
                cnt = 0
                if count_rows and "count" in count_rows[0]:
                    cnt = count_rows[0]["count"]
                cass_tables.append({"name": tbl, "row_count": cnt})
        cass.close()
        inventory["cassandra"] = {
            "status": "healthy",
            "keyspace": "boreal_audit",
            "tables": sorted(cass_tables, key=lambda x: x["name"]),
            "total_tables": len(cass_tables),
            "total_rows": sum(t["row_count"] for t in cass_tables),
        }
    except Exception as e:
        inventory["cassandra"]["error"] = str(e)

    try:
        s3_objs = s3_client.list_s3_objects()
        filtered_objs = [o for o in s3_objs if not o["key"].startswith("backups/")]
        prefixes_set: Set[str] = set()
        for o in filtered_objs:
            parts = o["key"].split("/")
            if len(parts) > 1:
                prefixes_set.add(parts[0] + "/")
            else:
                prefixes_set.add("root/")

        inventory["s3"] = {
            "status": "healthy",
            "bucket": os.getenv("S3_BUCKET", "boreal-storage"),
            "prefixes": sorted(list(prefixes_set)),
            "total_objects": len(filtered_objs),
            "total_size_bytes": sum(o["size"] for o in filtered_objs),
        }
    except Exception as e:
        inventory["s3"]["error"] = str(e)

    try:
        r = get_redis_connection()
        if r.ping():
            info = r.info()
            inventory["redis"] = {
                "status": "healthy",
                "key_count": r.dbsize(),
                "memory_used_human": info.get("used_memory_human", "0B"),
                "connected_clients": info.get("connected_clients", 0),
            }
        r.close()
    except Exception as e:
        inventory["redis"]["error"] = str(e)

    return inventory


def create_backup(
    backup_name: Optional[str] = None,
    backup_type: str = "full",
    engines: Optional[List[str]] = None,
    selected_mysql_tables: Optional[List[str]] = None,
    selected_cassandra_tables: Optional[List[str]] = None,
    selected_s3_prefixes: Optional[List[str]] = None,
    backup_redis: bool = True,
    is_pinned: bool = False,
    retention_days: int = 30,
    created_by_name: str = "Sistema",
) -> Dict[str, Any]:
    start_time = time.time()
    backup_uuid = str(uuid.uuid4())
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    date_str = now_utc.strftime("%Y-%m-%d %H:%M:%S")

    if not backup_name:
        backup_name = f"Respaldo Boreal - {now_utc.strftime('%Y%m%d_%H%M%S')}"

    if not engines:
        engines = ["mysql", "cassandra", "s3", "redis"]

    engines_str = ",".join(sorted(engines))
    expires_at = (now_utc + datetime.timedelta(days=retention_days)).strftime("%Y-%m-%d %H:%M:%S")

    mysql_conn = get_mysql_connection()
    with mysql_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO system_backups (uuid, backup_name, backup_type, status, engines, is_pinned, retention_days, expires_at, created_by_name) "
            "VALUES (%s, %s, %s, 'in_progress', %s, %s, %s, %s, %s)",
            (backup_uuid, backup_name, backup_type, engines_str, 1 if is_pinned else 0, retention_days, expires_at, created_by_name),
        )

    base_tmp_dir = os.path.abspath(os.path.join("tmp", "backups", backup_uuid))
    os.makedirs(base_tmp_dir, exist_ok=True)

    manifest: Dict[str, Any] = {
        "version": "1.0.0",
        "uuid": backup_uuid,
        "backup_name": backup_name,
        "backup_type": backup_type,
        "created_at": now_utc.isoformat(),
        "created_by": created_by_name,
        "engines": engines,
        "mysql": {"tables": {}, "total_rows": 0},
        "cassandra": {"keyspace": "boreal_audit", "tables": {}, "total_rows": 0},
        "s3": {"bucket": os.getenv("S3_BUCKET", "boreal-storage"), "objects": [], "total_objects": 0, "total_size_bytes": 0},
        "redis": {"keys_count": 0},
    }

    total_rows = 0
    total_tables = 0
    total_s3_objects = 0
    total_redis_keys = 0

    try:
        if "mysql" in engines:
            mysql_dump_dir = os.path.join(base_tmp_dir, "mysql")
            os.makedirs(mysql_dump_dir, exist_ok=True)
            with mysql_conn.cursor() as cur:
                cur.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
                all_tables = [list(r.values())[0] for r in cur.fetchall()]
                db_name = os.getenv("DB_NAME", "db_lottery")

                tables_to_dump = all_tables
                if selected_mysql_tables and len(selected_mysql_tables) > 0:
                    tables_to_dump = [t for t in all_tables if t in selected_mysql_tables]

                for t_name in tables_to_dump:
                    if t_name in ("system_backups", "system_backup_restores") and backup_type == "selective":
                        continue

                    cur.execute(
                        "SELECT COLUMN_NAME, DATA_TYPE, EXTRA "
                        "FROM information_schema.COLUMNS "
                        "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
                        (db_name, t_name),
                    )
                    cols = cur.fetchall()
                    gen_cols = [c["COLUMN_NAME"] for c in cols if "GENERATED" in (c.get("EXTRA") or "").upper() or "VIRTUAL" in (c.get("EXTRA") or "").upper()]
                    all_col_names = [c["COLUMN_NAME"] for c in cols]

                    cur.execute(f"SELECT * FROM `{t_name}`")
                    rows = cur.fetchall()

                    table_file = os.path.join(mysql_dump_dir, f"{t_name}.json")
                    with open(table_file, "w", encoding="utf-8") as f:
                        json.dump(rows, f, cls=CustomJSONEncoder, ensure_ascii=False)

                    cur.execute(f"SHOW CREATE TABLE `{t_name}`")
                    create_sql = cur.fetchone()["Create Table"]
                    schema_file = os.path.join(mysql_dump_dir, f"{t_name}.sql")
                    with open(schema_file, "w", encoding="utf-8") as f:
                        f.write(create_sql + ";\n")

                    manifest["mysql"]["tables"][t_name] = {
                        "row_count": len(rows),
                        "columns": all_col_names,
                        "generated_columns": gen_cols,
                    }
                    total_rows += len(rows)
                    total_tables += 1

            manifest["mysql"]["total_rows"] = sum(v["row_count"] for v in manifest["mysql"]["tables"].values())

        if "cassandra" in engines:
            cass_dump_dir = os.path.join(base_tmp_dir, "cassandra")
            os.makedirs(cass_dump_dir, exist_ok=True)
            cass_client = get_cassandra_connection()
            all_cass_tables = [r.get("table_name") for r in cass_client.query_json_rows("SELECT JSON table_name FROM system_schema.tables WHERE keyspace_name = 'boreal_audit';") if r.get("table_name")]

            tables_to_dump = all_cass_tables
            if selected_cassandra_tables and len(selected_cassandra_tables) > 0:
                tables_to_dump = [t for t in all_cass_tables if t in selected_cassandra_tables]

            for tbl in tables_to_dump:
                rows = cass_client.query_json_rows(f"SELECT JSON * FROM boreal_audit.{tbl};")
                cass_file = os.path.join(cass_dump_dir, f"{tbl}.jsonl")
                with open(cass_file, "w", encoding="utf-8") as f:
                    for r in rows:
                        f.write(json.dumps(r, cls=CustomJSONEncoder, ensure_ascii=False) + "\n")

                manifest["cassandra"]["tables"][tbl] = {
                    "row_count": len(rows),
                }
                total_rows += len(rows)
                total_tables += 1

            cass_client.close()
            manifest["cassandra"]["total_rows"] = sum(v["row_count"] for v in manifest["cassandra"]["tables"].values())

        if "s3" in engines:
            s3_dump_dir = os.path.join(base_tmp_dir, "s3")
            os.makedirs(s3_dump_dir, exist_ok=True)
            all_s3_objs = s3_client.list_s3_objects()
            non_backup_objs = [o for o in all_s3_objs if not o["key"].startswith("backups/")]

            objs_to_dump = non_backup_objs
            if selected_s3_prefixes and len(selected_s3_prefixes) > 0:
                objs_to_dump = [
                    o for o in non_backup_objs
                    if any(o["key"].startswith(p.lstrip("/")) for p in selected_s3_prefixes)
                ]

            for obj in objs_to_dump:
                obj_key = obj["key"]
                dest_file = os.path.join(s3_dump_dir, *obj_key.split("/"))
                os.makedirs(os.path.dirname(dest_file), exist_ok=True)
                s3_client.download_s3_object(obj_key, dest_file)

                manifest["s3"]["objects"].append({
                    "key": obj_key,
                    "size": obj["size"],
                    "etag": obj["etag"],
                })
                total_s3_objects += 1

            manifest["s3"]["total_objects"] = len(manifest["s3"]["objects"])
            manifest["s3"]["total_size_bytes"] = sum(o["size"] for o in manifest["s3"]["objects"])

        if "redis" in engines and backup_redis:
            redis_dump_dir = os.path.join(base_tmp_dir, "redis")
            os.makedirs(redis_dump_dir, exist_ok=True)
            r = get_redis_connection()
            keys = r.keys("*")
            redis_data = {}
            for k in keys:
                k_str = k.decode("utf-8", errors="replace")
                key_type = r.type(k).decode("utf-8", errors="replace")
                if key_type == "string":
                    redis_data[k_str] = {"type": "string", "value": r.get(k).decode("utf-8", errors="replace")}
                elif key_type == "hash":
                    h_val = r.hgetall(k)
                    redis_data[k_str] = {
                        "type": "hash",
                        "value": {hk.decode("utf-8", errors="replace"): hv.decode("utf-8", errors="replace") for hk, hv in h_val.items()},
                    }
                elif key_type == "set":
                    s_val = r.smembers(k)
                    redis_data[k_str] = {
                        "type": "set",
                        "value": [sv.decode("utf-8", errors="replace") for sv in s_val],
                    }
            redis_file = os.path.join(redis_dump_dir, "dump.json")
            with open(redis_file, "w", encoding="utf-8") as f:
                json.dump(redis_data, f, ensure_ascii=False)
            manifest["redis"]["keys_count"] = len(redis_data)
            total_redis_keys = len(redis_data)
            r.close()

        manifest_path = os.path.join(base_tmp_dir, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)

        uncompressed_size = 0
        for root, _, files in os.walk(base_tmp_dir):
            for file in files:
                uncompressed_size += os.path.getsize(os.path.join(root, file))

        tar_path = os.path.join("tmp", "backups", f"{backup_uuid}.tar.gz")
        with tarfile.open(tar_path, "w:gz") as tar:
            for item in os.listdir(base_tmp_dir):
                tar.add(os.path.join(base_tmp_dir, item), arcname=item)

        compressed_size = os.path.getsize(tar_path)
        sha256_hash = hashlib.sha256()
        with open(tar_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256_hash.update(chunk)
        sha256_hex = sha256_hash.hexdigest()

        s3_archive_key = f"backups/{backup_uuid}/backup_{backup_uuid}.tar.gz"
        s3_manifest_key = f"backups/{backup_uuid}/manifest.json"

        s3_client.upload_s3_file(s3_archive_key, tar_path, content_type="application/gzip")
        with open(manifest_path, "rb") as f:
            s3_client.upload_s3_bytes(s3_manifest_key, f.read(), content_type="application/json")

        duration_ms = int((time.time() - start_time) * 1000)

        with mysql_conn.cursor() as cur:
            cur.execute(
                "UPDATE system_backups SET "
                "status = 'completed', "
                "s3_archive_key = %s, "
                "s3_manifest_key = %s, "
                "sha256_checksum = %s, "
                "size_bytes = %s, "
                "uncompressed_size_bytes = %s, "
                "total_tables = %s, "
                "total_rows = %s, "
                "total_s3_objects = %s, "
                "total_redis_keys = %s, "
                "execution_duration_ms = %s, "
                "metadata = %s "
                "WHERE uuid = %s",
                (
                    s3_archive_key,
                    s3_manifest_key,
                    sha256_hex,
                    compressed_size,
                    uncompressed_size,
                    total_tables,
                    total_rows,
                    total_s3_objects,
                    total_redis_keys,
                    duration_ms,
                    json.dumps(manifest),
                    backup_uuid,
                ),
            )

        mysql_conn.close()

        try:
            shutil.rmtree(base_tmp_dir, ignore_errors=True)
            if os.path.exists(tar_path):
                os.remove(tar_path)
        except Exception:
            pass

        return {
            "success": True,
            "uuid": backup_uuid,
            "backup_name": backup_name,
            "status": "completed",
            "size_bytes": compressed_size,
            "uncompressed_size_bytes": uncompressed_size,
            "sha256": sha256_hex,
            "total_tables": total_tables,
            "total_rows": total_rows,
            "total_s3_objects": total_s3_objects,
            "total_redis_keys": total_redis_keys,
            "duration_ms": duration_ms,
            "s3_archive_key": s3_archive_key,
            "s3_manifest_key": s3_manifest_key,
        }

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        try:
            with mysql_conn.cursor() as cur:
                cur.execute(
                    "UPDATE system_backups SET status = 'failed', error_message = %s, execution_duration_ms = %s WHERE uuid = %s",
                    (str(e), duration_ms, backup_uuid),
                )
            mysql_conn.close()
        except Exception:
            pass

        try:
            shutil.rmtree(base_tmp_dir, ignore_errors=True)
            if os.path.exists(tar_path):
                os.remove(tar_path)
        except Exception:
            pass

        return {
            "success": False,
            "uuid": backup_uuid,
            "status": "failed",
            "error": str(e),
            "duration_ms": duration_ms,
        }


def restore_backup(
    backup_uuid: str,
    restore_mode: str = "merge",
    selected_components: Optional[Dict[str, Any]] = None,
    create_pre_restore_backup: bool = False,
    restored_by_name: str = "Administrador",
) -> Dict[str, Any]:
    start_time = time.time()
    restore_uuid = str(uuid.uuid4())
    mysql_conn = get_mysql_connection()

    if not selected_components:
        selected_components = {
            "mysql_tables": [],
            "cassandra_tables": [],
            "s3_prefixes": [],
            "redis": False,
        }

    selected_engines_list = []
    if selected_components.get("mysql_tables"):
        selected_engines_list.append("mysql")
    if selected_components.get("cassandra_tables"):
        selected_engines_list.append("cassandra")
    if selected_components.get("s3_prefixes"):
        selected_engines_list.append("s3")
    if selected_components.get("redis"):
        selected_engines_list.append("redis")
    selected_engines_str = ",".join(selected_engines_list) or "selective"

    pre_backup_uuid = None
    if create_pre_restore_backup:
        pre_res = create_backup(
            backup_name=f"Snapshot previo a restauración {backup_uuid[:8]}",
            backup_type="automated",
            is_pinned=True,
            created_by_name=f"Automático ({restored_by_name})",
        )
        if pre_res.get("success"):
            pre_backup_uuid = pre_res.get("uuid")

    with mysql_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO system_backup_restores (uuid, backup_uuid, status, restore_mode, selected_engines, selected_components, pre_restore_backup_uuid, restored_by_name) "
            "VALUES (%s, %s, 'in_progress', %s, %s, %s, %s, %s)",
            (restore_uuid, backup_uuid, restore_mode, selected_engines_str, json.dumps(selected_components), pre_backup_uuid, restored_by_name),
        )

    restore_report: Dict[str, Any] = {
        "restore_uuid": restore_uuid,
        "backup_uuid": backup_uuid,
        "restore_mode": restore_mode,
        "pre_restore_backup_uuid": pre_backup_uuid,
        "mysql": {},
        "cassandra": {},
        "s3": {},
        "redis": {},
    }

    base_extract_dir = os.path.abspath(os.path.join("tmp", "restores", restore_uuid))
    tar_download_path = os.path.abspath(os.path.join("tmp", "restores", f"{restore_uuid}.tar.gz"))
    os.makedirs(base_extract_dir, exist_ok=True)

    try:
        with mysql_conn.cursor() as cur:
            cur.execute("SELECT * FROM system_backups WHERE uuid = %s", (backup_uuid,))
            backup_record = cur.fetchone()

        if not backup_record:
            raise ValueError(f"Backup con UUID {backup_uuid} no encontrado en el catálogo")

        s3_archive_key = backup_record["s3_archive_key"]
        expected_sha256 = backup_record["sha256_checksum"]

        if not s3_client.download_s3_object(s3_archive_key, tar_download_path):
            raise IOError(f"No se pudo descargar el archivo de respaldo desde S3 ({s3_archive_key})")

        sha256_hash = hashlib.sha256()
        with open(tar_download_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256_hash.update(chunk)
        actual_sha256 = sha256_hash.hexdigest()

        if expected_sha256 and actual_sha256 != expected_sha256:
            raise ValueError(f"Error de integridad SHA-256. Esperado: {expected_sha256}, Obtenido: {actual_sha256}")

        with tarfile.open(tar_download_path, "r:gz") as tar:
            tar.extractall(path=base_extract_dir)

        manifest_path = os.path.join(base_extract_dir, "manifest.json")
        manifest_data = {}
        if os.path.exists(manifest_path):
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)

        sel_mysql = selected_components.get("mysql_tables") or []
        if sel_mysql:
            with mysql_conn.cursor() as cur:
                cur.execute("SET FOREIGN_KEY_CHECKS = 0;")
                cur.execute("SET UNIQUE_CHECKS = 0;")

                db_name = os.getenv("DB_NAME", "db_lottery")
                for table_name in sel_mysql:
                    if table_name in ("system_backups", "system_backup_restores") and restore_mode == "replace":
                        restore_report["mysql"][table_name] = {"skipped": True, "reason": "Protected catalog table"}
                        continue

                    json_file = os.path.join(base_extract_dir, "mysql", f"{table_name}.json")
                    if not os.path.exists(json_file):
                        restore_report["mysql"][table_name] = {"skipped": True, "reason": "No data in archive"}
                        continue

                    with open(json_file, "r", encoding="utf-8") as f:
                        rows = json.load(f)

                    cur.execute(
                        "SELECT COLUMN_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
                        (db_name, table_name),
                    )
                    cols_info = cur.fetchall()
                    gen_cols = {c["COLUMN_NAME"] for c in cols_info if "GENERATED" in (c.get("EXTRA") or "").upper() or "VIRTUAL" in (c.get("EXTRA") or "").upper()}

                    if restore_mode == "replace":
                        cur.execute(f"DELETE FROM `{table_name}`")

                    restored_count = 0
                    if rows:
                        first_row = rows[0]
                        valid_cols = [k for k in first_row.keys() if k not in gen_cols]
                        cols_sql = ", ".join(f"`{c}`" for c in valid_cols)
                        placeholders = ", ".join(["%s"] * len(valid_cols))

                        if restore_mode == "merge":
                            update_clauses = ", ".join(f"`{c}` = VALUES(`{c}`)" for c in valid_cols)
                            sql_insert = f"INSERT INTO `{table_name}` ({cols_sql}) VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {update_clauses}"
                        else:
                            sql_insert = f"INSERT INTO `{table_name}` ({cols_sql}) VALUES ({placeholders})"

                        batch_size = 500
                        for i in range(0, len(rows), batch_size):
                            batch = rows[i : i + batch_size]
                            params_batch = []
                            for r in batch:
                                params_batch.append([
                                    json.dumps(r[c]) if isinstance(r[c], (dict, list)) else r[c]
                                    for c in valid_cols
                                ])
                            cur.executemany(sql_insert, params_batch)
                            restored_count += len(batch)

                    restore_report["mysql"][table_name] = {
                        "restored_rows": restored_count,
                        "mode": restore_mode,
                    }

                cur.execute("SET FOREIGN_KEY_CHECKS = 1;")
                cur.execute("SET UNIQUE_CHECKS = 1;")

        sel_cass = selected_components.get("cassandra_tables") or []
        if sel_cass:
            cass_client = get_cassandra_connection()
            for tbl in sel_cass:
                jsonl_file = os.path.join(base_extract_dir, "cassandra", f"{tbl}.jsonl")
                if not os.path.exists(jsonl_file):
                    restore_report["cassandra"][tbl] = {"skipped": True, "reason": "No data in archive"}
                    continue

                if restore_mode == "replace":
                    cass_client.query(f"TRUNCATE boreal_audit.{tbl};")

                restored_count = 0
                with open(jsonl_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            cass_client.execute_insert_json(f"boreal_audit.{tbl}", line)
                            restored_count += 1

                restore_report["cassandra"][tbl] = {
                    "restored_rows": restored_count,
                    "mode": restore_mode,
                }
            cass_client.close()

        sel_s3 = selected_components.get("s3_prefixes") or []
        if sel_s3:
            s3_ext_dir = os.path.join(base_extract_dir, "s3")
            restored_s3_objs = 0
            if os.path.exists(s3_ext_dir):
                for root, _, files in os.walk(s3_ext_dir):
                    for file in files:
                        full_path = os.path.join(root, file)
                        rel_key = os.path.relpath(full_path, s3_ext_dir).replace("\\", "/")

                        should_restore = any(rel_key.startswith(p.lstrip("/")) for p in sel_s3)
                        if should_restore:
                            s3_client.upload_s3_file(rel_key, full_path)
                            restored_s3_objs += 1

            restore_report["s3"] = {
                "restored_objects": restored_s3_objs,
                "prefixes": sel_s3,
            }

        if selected_components.get("redis"):
            redis_json_file = os.path.join(base_extract_dir, "redis", "dump.json")
            if os.path.exists(redis_json_file):
                with open(redis_json_file, "r", encoding="utf-8") as f:
                    redis_data = json.load(f)
                r = get_redis_connection()
                restored_keys = 0
                for k, item in redis_data.items():
                    k_type = item.get("type")
                    k_val = item.get("value")
                    if k_type == "string":
                        r.set(k, k_val)
                        restored_keys += 1
                    elif k_type == "hash":
                        r.hset(k, mapping=k_val)
                        restored_keys += 1
                    elif k_type == "set":
                        if k_val:
                            r.sadd(k, *k_val)
                        restored_keys += 1
                r.close()
                restore_report["redis"] = {"restored_keys": restored_keys}

        duration_ms = int((time.time() - start_time) * 1000)

        with mysql_conn.cursor() as cur:
            cur.execute(
                "UPDATE system_backup_restores SET "
                "status = 'completed', "
                "execution_duration_ms = %s, "
                "restore_report = %s "
                "WHERE uuid = %s",
                (duration_ms, json.dumps(restore_report), restore_uuid),
            )

        mysql_conn.close()

        try:
            shutil.rmtree(base_extract_dir, ignore_errors=True)
            if os.path.exists(tar_download_path):
                os.remove(tar_download_path)
        except Exception:
            pass

        return {
            "success": True,
            "restore_uuid": restore_uuid,
            "backup_uuid": backup_uuid,
            "status": "completed",
            "duration_ms": duration_ms,
            "report": restore_report,
        }

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        try:
            with mysql_conn.cursor() as cur:
                cur.execute(
                    "UPDATE system_backup_restores SET status = 'failed', error_message = %s, execution_duration_ms = %s WHERE uuid = %s",
                    (str(e), duration_ms, restore_uuid),
                )
            mysql_conn.close()
        except Exception:
            pass

        try:
            shutil.rmtree(base_extract_dir, ignore_errors=True)
            if os.path.exists(tar_download_path):
                os.remove(tar_download_path)
        except Exception:
            pass

        return {
            "success": False,
            "restore_uuid": restore_uuid,
            "backup_uuid": backup_uuid,
            "status": "failed",
            "error": str(e),
            "duration_ms": duration_ms,
        }


def verify_backup(backup_uuid: str) -> Dict[str, Any]:
    mysql_conn = get_mysql_connection()
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM system_backups WHERE uuid = %s", (backup_uuid,))
        rec = cur.fetchone()
    mysql_conn.close()

    if not rec:
        return {"success": False, "error": f"Backup {backup_uuid} not found"}

    s3_archive_key = rec["s3_archive_key"]
    expected_sha256 = rec["sha256_checksum"]
    expected_size = rec["size_bytes"]

    tmp_tar = os.path.abspath(os.path.join("tmp", f"verify_{backup_uuid}.tar.gz"))
    os.makedirs(os.path.dirname(tmp_tar), exist_ok=True)

    try:
        if not s3_client.download_s3_object(s3_archive_key, tmp_tar):
            return {"success": False, "error": f"Failed to download archive {s3_archive_key} from S3"}

        actual_size = os.path.getsize(tmp_tar)
        sha256_hash = hashlib.sha256()
        with open(tmp_tar, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256_hash.update(chunk)
        actual_sha256 = sha256_hash.hexdigest()

        tar_contents = []
        is_valid_archive = False
        try:
            with tarfile.open(tmp_tar, "r:gz") as tar:
                tar_contents = tar.getnames()
                is_valid_archive = True
        except Exception as e:
            is_valid_archive = False

        if os.path.exists(tmp_tar):
            os.remove(tmp_tar)

        hash_matches = (actual_sha256 == expected_sha256)
        size_matches = (actual_size == expected_size)

        return {
            "success": hash_matches and is_valid_archive,
            "uuid": backup_uuid,
            "hash_matches": hash_matches,
            "size_matches": size_matches,
            "is_valid_archive": is_valid_archive,
            "expected_sha256": expected_sha256,
            "actual_sha256": actual_sha256,
            "expected_size_bytes": expected_size,
            "actual_size_bytes": actual_size,
            "archive_files_count": len(tar_contents),
            "archive_files": tar_contents[:20],
        }
    except Exception as e:
        if os.path.exists(tmp_tar):
            os.remove(tmp_tar)
        return {"success": False, "error": str(e)}


def sync_s3_catalog() -> Dict[str, Any]:
    objs = s3_client.list_s3_objects("backups/")
    manifest_keys = [o["key"] for o in objs if o["key"].endswith("manifest.json")]

    synced_count = 0
    errors = []
    mysql_conn = get_mysql_connection()

    for m_key in manifest_keys:
        try:
            raw_manifest = s3_client.download_s3_bytes(m_key)
            if not raw_manifest:
                continue
            m = json.loads(raw_manifest.decode("utf-8"))
            b_uuid = m.get("uuid")
            if not b_uuid:
                continue

            archive_key = f"backups/{b_uuid}/backup_{b_uuid}.tar.gz"
            matching_archives = [o for o in objs if o["key"] == archive_key]
            archive_size = matching_archives[0]["size"] if matching_archives else 0

            with mysql_conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO system_backups (uuid, backup_name, backup_type, status, engines, s3_bucket, s3_archive_key, s3_manifest_key, size_bytes, total_tables, total_rows, total_s3_objects, total_redis_keys, created_by_name, metadata) "
                    "VALUES (%s, %s, %s, 'completed', %s, 'boreal-storage', %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE "
                    "backup_name = VALUES(backup_name), "
                    "status = 'completed', "
                    "size_bytes = VALUES(size_bytes), "
                    "metadata = VALUES(metadata)",
                    (
                        b_uuid,
                        m.get("backup_name", f"S3 Import {b_uuid[:8]}"),
                        m.get("backup_type", "full"),
                        ",".join(m.get("engines", ["mysql"])),
                        archive_key,
                        m_key,
                        archive_size,
                        len(m.get("mysql", {}).get("tables", {})),
                        m.get("mysql", {}).get("total_rows", 0) + m.get("cassandra", {}).get("total_rows", 0),
                        m.get("s3", {}).get("total_objects", 0),
                        m.get("redis", {}).get("keys_count", 0),
                        m.get("created_by", "S3 Import"),
                        json.dumps(m),
                    ),
                )
                synced_count += 1
        except Exception as e:
            errors.append(f"{m_key}: {str(e)}")

    mysql_conn.close()
    return {
        "success": True,
        "manifests_found": len(manifest_keys),
        "synced_count": synced_count,
        "errors": errors,
    }


def delete_backup(backup_uuid: str) -> Dict[str, Any]:
    mysql_conn = get_mysql_connection()
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT * FROM system_backups WHERE uuid = %s", (backup_uuid,))
        rec = cur.fetchone()

    if not rec:
        mysql_conn.close()
        return {"success": False, "error": f"Backup {backup_uuid} not found"}

    if rec.get("is_pinned"):
        mysql_conn.close()
        return {"success": False, "error": "Cannot delete a pinned backup"}

    s3_archive = rec.get("s3_archive_key")
    s3_manifest = rec.get("s3_manifest_key")

    if s3_archive:
        s3_client.delete_s3_object(s3_archive)
    if s3_manifest:
        s3_client.delete_s3_object(s3_manifest)

    with mysql_conn.cursor() as cur:
        cur.execute("DELETE FROM system_backups WHERE uuid = %s", (backup_uuid,))
    mysql_conn.close()

    return {"success": True, "uuid": backup_uuid}


def purge_expired_backups() -> Dict[str, Any]:
    mysql_conn = get_mysql_connection()
    with mysql_conn.cursor() as cur:
        cur.execute(
            "SELECT uuid, s3_archive_key, s3_manifest_key FROM system_backups "
            "WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND is_pinned = 0 AND status = 'completed'"
        )
        expired = cur.fetchall()

    deleted_uuids = []
    for item in expired:
        b_uuid = item["uuid"]
        if item.get("s3_archive_key"):
            s3_client.delete_s3_object(item["s3_archive_key"])
        if item.get("s3_manifest_key"):
            s3_client.delete_s3_object(item["s3_manifest_key"])

        with mysql_conn.cursor() as cur:
            cur.execute("DELETE FROM system_backups WHERE uuid = %s", (b_uuid,))
        deleted_uuids.append(b_uuid)

    mysql_conn.close()
    return {"success": True, "purged_count": len(deleted_uuids), "purged_uuids": deleted_uuids}


def main():
    parser = argparse.ArgumentParser(description="Spriteboard Disaster Recovery & Backup Engine")
    parser.add_argument("--action", required=True, choices=["inspect_live", "create", "restore", "verify", "sync_catalog", "delete", "purge_expired"])
    parser.add_argument("--name", type=str, default=None)
    parser.add_argument("--type", type=str, default="full", choices=["full", "selective", "automated"])
    parser.add_argument("--engines", type=str, default="mysql,cassandra,s3,redis")
    parser.add_argument("--mysql-tables", type=str, default="")
    parser.add_argument("--cassandra-tables", type=str, default="")
    parser.add_argument("--s3-prefixes", type=str, default="")
    parser.add_argument("--backup-redis", action="store_true", default=True)
    parser.add_argument("--pinned", action="store_true", default=False)
    parser.add_argument("--retention-days", type=int, default=30)
    parser.add_argument("--created-by", type=str, default="Sistema")
    parser.add_argument("--backup-uuid", type=str, default="")
    parser.add_argument("--restore-mode", type=str, default="merge", choices=["merge", "replace"])
    parser.add_argument("--restore-components", type=str, default="")
    parser.add_argument("--pre-restore-backup", action="store_true", default=False)
    parser.add_argument("--json", action="store_true", default=True)

    args = parser.parse_args()

    result: Dict[str, Any] = {}

    if args.action == "inspect_live":
        result = inspect_live_inventory()

    elif args.action == "create":
        engines_list = [e.strip() for e in args.engines.split(",") if e.strip()]
        mysql_tables = [t.strip() for t in args.mysql_tables.split(",") if t.strip()] if args.mysql_tables else []
        cass_tables = [t.strip() for t in args.cassandra_tables.split(",") if t.strip()] if args.cassandra_tables else []
        s3_prefixes = [p.strip() for p in args.s3_prefixes.split(",") if p.strip()] if args.s3_prefixes else []

        result = create_backup(
            backup_name=args.name,
            backup_type=args.type,
            engines=engines_list,
            selected_mysql_tables=mysql_tables,
            selected_cassandra_tables=cass_tables,
            selected_s3_prefixes=s3_prefixes,
            backup_redis=args.backup_redis,
            is_pinned=args.pinned,
            retention_days=args.retention_days,
            created_by_name=args.created_by,
        )

    elif args.action == "restore":
        components = {}
        if args.restore_components:
            raw_comp = args.restore_components.strip()
            if os.path.exists(raw_comp):
                try:
                    with open(raw_comp, "r", encoding="utf-8") as f:
                        components = json.load(f)
                except Exception:
                    components = {}
            elif raw_comp.startswith("{"):
                try:
                    components = json.loads(raw_comp)
                except Exception:
                    components = {}
            else:
                try:
                    import base64
                    decoded = base64.b64decode(raw_comp.encode("utf-8")).decode("utf-8")
                    components = json.loads(decoded)
                except Exception:
                    components = {}

        result = restore_backup(
            backup_uuid=args.backup_uuid,
            restore_mode=args.restore_mode,
            selected_components=components,
            create_pre_restore_backup=args.pre_restore_backup,
            restored_by_name=args.created_by,
        )

    elif args.action == "verify":
        result = verify_backup(args.backup_uuid)

    elif args.action == "sync_catalog":
        result = sync_s3_catalog()

    elif args.action == "delete":
        result = delete_backup(args.backup_uuid)

    elif args.action == "purge_expired":
        result = purge_expired_backups()

    print(json.dumps(result, cls=CustomJSONEncoder))


if __name__ == "__main__":
    main()
