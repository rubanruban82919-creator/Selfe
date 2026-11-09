"""RetinaGuard local API. Roles are enforced here, not only in the browser."""

import hashlib
import hmac
import json
import os
import re
import secrets
import socket
import sqlite3
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "retinaguard.db")
SEED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_patients.json")
HOST = "127.0.0.1"
PORT = 8080
PBKDF2_ROUNDS = 210_000
SESSION_HOURS = 12
ROLES = ("super_admin", "doctor", "staff")

PERMISSIONS = {
    "super_admin": {
        "patients.read", "patients.write", "patients.delete",
        "scans.read", "scans.write", "scans.delete",
        "reports.read", "reports.write", "reports.delete",
        "analytics.read", "detection.run",
        "users.manage", "audit.read",
    },
    "doctor": {
        "patients.read", "patients.write", "patients.delete",
        "scans.read", "scans.write", "scans.delete",
        "reports.read", "reports.write",
        "analytics.read", "detection.run",
    },
    "staff": {
        "patients.read", "scans.read", "reports.read", "analytics.read",
    },
}

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
}

LOCK = threading.Lock()
LOGIN_ATTEMPTS = {}
DUMMY_SALT = secrets.token_bytes(16)
DUMMY_HASH = hashlib.pbkdf2_hmac("sha256", b"not-a-real-password", DUMMY_SALT, PBKDF2_ROUNDS)


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def connect():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with LOCK:
        conn = connect()
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                role TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS patients (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                author_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                actor_id TEXT,
                actor_email TEXT,
                action TEXT NOT NULL,
                detail TEXT NOT NULL
            );
            """
        )
        count = conn.execute("SELECT COUNT(*) AS n FROM patients").fetchone()["n"]
        if count == 0 and os.path.exists(SEED_PATH):
            with open(SEED_PATH, "r", encoding="utf-8") as handle:
                patients = json.load(handle)
            stamp = now_iso()
            for patient in patients:
                conn.execute(
                    "INSERT INTO patients (id, payload, updated_at) VALUES (?, ?, ?)",
                    (patient["id"], json.dumps(patient), stamp),
                )
            conn.execute(
                "INSERT INTO audit_log (created_at, actor_id, actor_email, action, detail) VALUES (?, ?, ?, ?, ?)",
                (stamp, None, None, "registry.seed", "Loaded the existing demonstration registry"),
            )
        conn.commit()
        conn.close()


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return salt.hex(), digest.hex()


def verify_password(password, salt_hex, hash_hex):
    salt = bytes.fromhex(salt_hex)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return hmac.compare_digest(digest.hex(), hash_hex)


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def password_ok(password):
    if not isinstance(password, str) or len(password) < 12 or len(password) > 128:
        return False
    has_letter = any(ch.isalpha() for ch in password)
    has_number = any(ch.isdigit() for ch in password)
    return has_letter and has_number


def email_ok(email):
    return isinstance(email, str) and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email.strip()) is not None


def public_user(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "active": bool(row["active"]),
        "createdAt": row["created_at"],
    }


def cohort_counts(patients):
    stages = {f"stage{grade}": 0 for grade in range(5)}
    counts = {"improved": 0, "stable": 0, "worsened": 0, "baseline": 0, "referable": 0}
    for patient in patients:
        scans = patient.get("scans") or []
        latest = sorted(scans, key=lambda scan: scan.get("date") or "", reverse=True)
        eye = (latest[0].get("eye") or "OD") if latest else "OD"
        series = sorted(
            [scan for scan in scans if (scan.get("eye") or "OD") == eye],
            key=lambda scan: scan.get("date") or "",
        )
        current = series[-1] if series else None
        previous = series[-2] if len(series) > 1 else None
        if current is None:
            counts["baseline"] += 1
            continue
        stage = int(current.get("stage") or 0)
        if 0 <= stage <= 4:
            stages[f"stage{stage}"] += 1
        if stage >= 2:
            counts["referable"] += 1
        if previous is None:
            counts["baseline"] += 1
        else:
            difference = stage - int(previous.get("stage") or 0)
            if difference > 0:
                counts["worsened"] += 1
            elif difference < 0:
                counts["improved"] += 1
            else:
                counts["stable"] += 1
    counts["stages"] = stages
    return counts


def audit(conn, actor, action, detail):
    conn.execute(
        "INSERT INTO audit_log (created_at, actor_id, actor_email, action, detail) VALUES (?, ?, ?, ?, ?)",
        (
            now_iso(),
            actor["id"] if actor else None,
            actor["email"] if actor else None,
            action,
            detail[:500],
        ),
    )


def client_ip(handler):
    return handler.client_address[0] if handler.client_address else "unknown"


ATTEMPT_WINDOW_SECONDS = 600
MAX_FAILED_ATTEMPTS = 8


def recent_attempts(ip):
    now = time.time()
    window = [stamp for stamp in LOGIN_ATTEMPTS.get(ip, []) if now - stamp < ATTEMPT_WINDOW_SECONDS]
    if window:
        LOGIN_ATTEMPTS[ip] = window
    else:
        LOGIN_ATTEMPTS.pop(ip, None)
    return window


def lock_remaining(ip):
    window = recent_attempts(ip)
    if len(window) < MAX_FAILED_ATTEMPTS:
        return 0
    return max(1, int(ATTEMPT_WINDOW_SECONDS - (time.time() - window[0])) + 1)


def record_attempt(ip):
    LOGIN_ATTEMPTS.setdefault(ip, []).append(time.time())


def clear_attempts(ip):
    LOGIN_ATTEMPTS.pop(ip, None)


class App(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.route("GET", parsed.path)
        else:
            self.serve_static(parsed.path)

    def do_POST(self):
        self.route("POST", urlparse(self.path).path)

    def do_PUT(self):
        self.route("PUT", urlparse(self.path).path)

    def do_PATCH(self):
        self.route("PATCH", urlparse(self.path).path)

    def do_DELETE(self):
        self.route("DELETE", urlparse(self.path).path)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length > 12_000_000:
            raise ValueError("Request is too large")
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("JSON object required")
        return data

    def send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def cookie_token(self):
        header = self.headers.get("Cookie", "")
        for part in header.split(";"):
            name, _, value = part.strip().partition("=")
            if name == "rg_session":
                return value
        return ""

    def session_cookie(self, token):
        max_age = SESSION_HOURS * 3600
        return f"rg_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={max_age}"

    def clear_cookie(self):
        return "rg_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"

    def origin_ok(self):
        host = (self.headers.get("Host") or "").split(",")[0].strip()
        origin = self.headers.get("Origin")
        if origin:
            origin_host = origin.replace("http://", "").replace("https://", "").split("/")[0]
            if origin_host != host and not (self.loopback(origin_host) and self.loopback(host)):
                return False
        if self.command != "GET" and self.headers.get("X-RetinaGuard-Client") != "browser":
            return False
        return True

    @staticmethod
    def loopback(host):
        name = host.lower()
        if name.startswith("["):
            name = name.split("]")[0] + "]"
        else:
            name = name.split(":")[0]
        return name in {"127.0.0.1", "localhost", "[::1]", "::1"}

    def current_user(self, conn):
        token = self.cookie_token()
        if not token:
            return None
        row = conn.execute(
            """
            SELECT users.*, sessions.expires_at
            FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
            """,
            (token_hash(token),),
        ).fetchone()
        if not row:
            return None
        if row["expires_at"] < now_iso() or not row["active"]:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
            conn.commit()
            return None
        conn.execute(
            "UPDATE sessions SET last_seen = ? WHERE token_hash = ?",
            (now_iso(), token_hash(token)),
        )
        return row

    def require(self, conn, permission):
        if not self.origin_ok():
            self.send_json(403, {"error": "Request was rejected"})
            return None
        user = self.current_user(conn)
        if not user:
            self.send_json(401, {"error": "Sign in required"})
            return None
        if permission and permission not in PERMISSIONS.get(user["role"], set()):
            self.send_json(403, {"error": "This account cannot perform that action"})
            return None
        return user

    def route(self, method, path):
        try:
            parts = [unquote(part) for part in path.split("/") if part]
            if len(parts) < 2 or parts[0] != "api":
                self.send_json(404, {"error": "Not found"})
                return
            if method != "GET" and not self.origin_ok() and parts[1] not in ("login", "setup"):
                self.send_json(403, {"error": "Request was rejected"})
                return
            with LOCK:
                conn = connect()
                try:
                    self.dispatch(conn, method, parts[1:])
                    conn.commit()
                finally:
                    conn.close()
        except json.JSONDecodeError:
            self.send_json(400, {"error": "The sign-in request was not valid JSON."})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "The server could not complete sign-in. See the server window for the error."})

    def dispatch(self, conn, method, parts):
        head = parts[0]
        if head == "health" and method == "GET":
            self.send_json(200, {"ok": True})
        elif head == "setup" and method == "GET":
            count = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
            self.send_json(200, {"needsSetup": count == 0})
        elif head == "setup" and method == "POST":
            self.setup_owner(conn)
        elif head == "login" and method == "POST":
            self.login(conn)
        elif head == "logout" and method == "POST":
            self.logout(conn)
        elif head == "me" and method == "GET":
            user = self.require(conn, None)
            if user:
                self.send_json(200, {"user": public_user(user), "permissions": sorted(PERMISSIONS[user["role"]])})
        elif head == "patients" and len(parts) == 1 and method == "GET":
            self.list_patients(conn)
        elif head == "patients" and len(parts) == 1 and method == "POST":
            self.create_patient(conn)
        elif head == "patients" and len(parts) == 2 and parts[1] == "merge" and method == "POST":
            self.merge_patients(conn)
        elif head == "patients" and len(parts) == 2 and method == "PUT":
            self.update_patient(conn, parts[1])
        elif head == "patients" and len(parts) == 2 and method == "DELETE":
            self.delete_patient(conn, parts[1])
        elif head == "patients" and len(parts) == 4 and parts[2] == "scans" and method == "POST":
            self.add_scan(conn, parts[1])
        elif head == "patients" and len(parts) == 4 and parts[2] == "scans" and method == "DELETE":
            self.delete_scan(conn, parts[1], parts[3])
        elif head == "predictions" and method == "GET":
            self.list_predictions(conn)
        elif head == "reports" and len(parts) == 1 and method == "GET":
            self.list_reports(conn)
        elif head == "reports" and len(parts) == 1 and method == "POST":
            self.create_report(conn)
        elif head == "reports" and len(parts) == 2 and method == "DELETE":
            self.delete_report(conn, parts[1])
        elif head == "analytics" and method == "GET":
            self.analytics(conn)
        elif head == "users" and len(parts) == 1 and method == "GET":
            self.list_users(conn)
        elif head == "users" and len(parts) == 1 and method == "POST":
            self.create_user(conn)
        elif head == "users" and len(parts) == 2 and method == "PATCH":
            self.update_user(conn, parts[1])
        elif head == "audit" and method == "GET":
            self.list_audit(conn)
        else:
            self.send_json(404, {"error": "Not found"})

    def setup_owner(self, conn):
        if not self.origin_ok():
            self.send_json(403, {"error": "Request was rejected"})
            return
        if conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]:
            self.send_json(403, {"error": "Setup is already complete"})
            return
        data = self.read_json()
        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        password = data.get("password", "")
        if len(name) < 2 or not email_ok(email) or not password_ok(password):
            self.send_json(400, {"error": "Use a name, a valid email, and a password of at least 12 characters with a letter and a number"})
            return
        if data.get("password") != data.get("confirmPassword"):
            self.send_json(400, {"error": "The passwords do not match"})
            return
        user = self.insert_user(conn, name, email, password, "super_admin", True)
        audit(conn, user, "account.setup", "Created the Super Admin owner account")
        self.start_session(conn, user)

    def insert_user(self, conn, name, email, password, role, active):
        salt, digest = hash_password(password)
        user_id = "USR-" + secrets.token_hex(4).upper()
        stamp = now_iso()
        conn.execute(
            """
            INSERT INTO users (id, name, email, password_hash, password_salt, role, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, name, email, digest, salt, role, 1 if active else 0, stamp, stamp),
        )
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    def start_session(self, conn, user):
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).replace(microsecond=0).isoformat()
        stamp = now_iso()
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)",
            (token_hash(token), user["id"], stamp, expires, stamp),
        )
        conn.commit()
        self.send_json(
            200,
            {"user": public_user(user), "permissions": sorted(PERMISSIONS[user["role"]])},
            {"Set-Cookie": self.session_cookie(token)},
        )

    def login(self, conn):
        if not self.origin_ok():
            self.send_json(403, {"error": "Request was rejected"})
            return
        ip = client_ip(self)
        remaining = lock_remaining(ip)
        if remaining:
            print(f"Sign-in paused for {ip}: {remaining}s remaining in the 10 minute window", flush=True)
            self.send_json(429, {
                "error": f"Too many sign-in attempts from this browser. The account is not locked. Try again in {remaining} seconds.",
                "retryAfter": remaining,
            }, {"Retry-After": str(remaining)})
            return
        data = self.read_json()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        if conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0:
            self.send_json(409, {
                "error": "No Super Admin account exists yet. Create the owner account on the setup screen. There is no default password.",
                "needsSetup": True
            })
            return
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        valid = False
        if row:
            valid = verify_password(password, row["password_salt"], row["password_hash"]) and bool(row["active"])
        else:
            hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), DUMMY_SALT, PBKDF2_ROUNDS), DUMMY_HASH)
        if not valid:
            record_attempt(ip)
            print(f"Sign-in denied from {ip}", flush=True)
            audit(conn, row if row else None, "auth.denied", f"Failed sign-in for {email or 'unknown email'}")
            self.send_json(401, {"error": "Invalid email or password"})
            return
        clear_attempts(ip)
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?", (row["id"], now_iso()))
        audit(conn, row, "auth.login", "Signed in")
        self.start_session(conn, row)

    def logout(self, conn):
        token = self.cookie_token()
        user = self.current_user(conn) if token else None
        if token:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
        if user:
            audit(conn, user, "auth.logout", "Signed out")
        self.send_json(200, {"ok": True}, {"Set-Cookie": self.clear_cookie()})

    def list_patients(self, conn):
        if not self.require(conn, "patients.read"):
            return
        rows = conn.execute("SELECT payload FROM patients ORDER BY updated_at DESC").fetchall()
        self.send_json(200, {"patients": [json.loads(row["payload"]) for row in rows]})

    def create_patient(self, conn):
        user = self.require(conn, "patients.write")
        if not user:
            return
        patient = self.read_json()
        name = str(patient.get("name", "")).strip()
        if len(name) < 2:
            self.send_json(400, {"error": "Patient name is required"})
            return
        patient_id = "DR-" + datetime.now(timezone.utc).strftime("%Y") + "-" + secrets.token_hex(2).upper()
        patient["id"] = patient_id
        patient["name"] = name
        patient["scans"] = []
        patient["lastVisitDate"] = patient.get("lastVisitDate") or "—"
        conn.execute(
            "INSERT INTO patients (id, payload, updated_at) VALUES (?, ?, ?)",
            (patient_id, json.dumps(patient), now_iso()),
        )
        audit(conn, user, "patient.create", f"Created {patient_id} {name}")
        self.send_json(201, {"patient": patient})

    def merge_patients(self, conn):
        user = self.require(conn, "patients.write")
        if not user:
            return
        incoming = self.read_json().get("patients", [])
        if not isinstance(incoming, list):
            self.send_json(400, {"error": "Patient list required"})
            return
        changed = 0
        for patient in incoming:
            if not isinstance(patient, dict) or not patient.get("id") or not patient.get("name"):
                continue
            conn.execute(
                "INSERT INTO patients (id, payload, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
                (str(patient["id"]), json.dumps(patient), now_iso()),
            )
            changed += 1
        audit(conn, user, "patient.merge", f"Merged {changed} browser records")
        self.send_json(200, {"merged": changed})

    def update_patient(self, conn, patient_id):
        user = self.require(conn, "patients.write")
        if not user:
            return
        row = conn.execute("SELECT payload FROM patients WHERE id = ?", (patient_id,)).fetchone()
        if not row:
            self.send_json(404, {"error": "Patient not found"})
            return
        current = json.loads(row["payload"])
        patch = self.read_json()
        for key in ("name", "age", "gender", "dob", "diabetesType", "diabetesDuration", "hba1c", "visualAcuityOD", "visualAcuityOS", "primaryDoctor", "clinicalNotes"):
            if key in patch:
                current[key] = patch[key]
        if not str(current.get("name", "")).strip():
            self.send_json(400, {"error": "Patient name is required"})
            return
        conn.execute(
            "UPDATE patients SET payload = ?, updated_at = ? WHERE id = ?",
            (json.dumps(current), now_iso(), patient_id),
        )
        audit(conn, user, "patient.update", f"Updated {patient_id}")
        self.send_json(200, {"patient": current})

    def delete_patient(self, conn, patient_id):
        user = self.require(conn, "patients.delete")
        if not user:
            return
        deleted = conn.execute("DELETE FROM patients WHERE id = ?", (patient_id,)).rowcount
        if not deleted:
            self.send_json(404, {"error": "Patient not found"})
            return
        conn.execute("DELETE FROM reports WHERE patient_id = ?", (patient_id,))
        audit(conn, user, "patient.delete", f"Deleted {patient_id}")
        self.send_json(200, {"ok": True})

    def add_scan(self, conn, patient_id):
        user = self.require(conn, "scans.write")
        if not user:
            return
        row = conn.execute("SELECT payload FROM patients WHERE id = ?", (patient_id,)).fetchone()
        if not row:
            self.send_json(404, {"error": "Patient not found"})
            return
        scan = self.read_json()
        if scan.get("stage") not in (0, 1, 2, 3, 4):
            self.send_json(400, {"error": "A five-class stage from 0 to 4 is required"})
            return
        patient = json.loads(row["payload"])
        scan["id"] = scan.get("id") or ("SCN-" + secrets.token_hex(3).upper())
        scan.pop("stageData", None)
        patient.setdefault("scans", []).append(scan)
        patient["lastVisitDate"] = scan.get("date") or patient.get("lastVisitDate")
        conn.execute(
            "UPDATE patients SET payload = ?, updated_at = ? WHERE id = ?",
            (json.dumps(patient), now_iso(), patient_id),
        )
        audit(conn, user, "scan.create", f"{scan['id']} for {patient_id} stage {scan.get('stage')}")
        self.send_json(201, {"patient": patient})

    def delete_scan(self, conn, patient_id, scan_id):
        user = self.require(conn, "scans.delete")
        if not user:
            return
        row = conn.execute("SELECT payload FROM patients WHERE id = ?", (patient_id,)).fetchone()
        if not row:
            self.send_json(404, {"error": "Patient not found"})
            return
        patient = json.loads(row["payload"])
        before = len(patient.get("scans", []))
        patient["scans"] = [scan for scan in patient.get("scans", []) if scan.get("id") != scan_id]
        if len(patient["scans"]) == before:
            self.send_json(404, {"error": "Scan not found"})
            return
        conn.execute(
            "UPDATE patients SET payload = ?, updated_at = ? WHERE id = ?",
            (json.dumps(patient), now_iso(), patient_id),
        )
        audit(conn, user, "scan.delete", f"Deleted {scan_id} from {patient_id}")
        self.send_json(200, {"patient": patient})

    def list_predictions(self, conn):
        if not self.require(conn, "scans.read"):
            return
        rows = []
        for record in conn.execute("SELECT payload FROM patients").fetchall():
            patient = json.loads(record["payload"])
            for scan in patient.get("scans", []):
                rows.append({
                    "patientId": patient.get("id"),
                    "patientName": patient.get("name"),
                    "scanId": scan.get("id"),
                    "date": scan.get("date"),
                    "eye": scan.get("eyeLabel") or scan.get("eye"),
                    "stage": scan.get("stage"),
                    "confidence": scan.get("confidence"),
                    "label": scan.get("label"),
                })
        rows.sort(key=lambda item: item.get("date") or "", reverse=True)
        self.send_json(200, {"predictions": rows})

    def list_reports(self, conn):
        if not self.require(conn, "reports.read"):
            return
        rows = conn.execute(
            "SELECT id, patient_id, title, body, author_id, created_at FROM reports ORDER BY created_at DESC"
        ).fetchall()
        self.send_json(200, {"reports": [dict(row) for row in rows]})

    def create_report(self, conn):
        user = self.require(conn, "reports.write")
        if not user:
            return
        data = self.read_json()
        patient_id = str(data.get("patientId", "")).strip()
        title = str(data.get("title", "")).strip() or "Clinical summary"
        body = str(data.get("body", "")).strip()
        if not patient_id or not body:
            self.send_json(400, {"error": "A patient and report text are required"})
            return
        if not conn.execute("SELECT 1 FROM patients WHERE id = ?", (patient_id,)).fetchone():
            self.send_json(404, {"error": "Patient not found"})
            return
        report_id = "RPT-" + secrets.token_hex(3).upper()
        conn.execute(
            "INSERT INTO reports (id, patient_id, title, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (report_id, patient_id, title, body[:8000], user["id"], now_iso()),
        )
        audit(conn, user, "report.create", f"{report_id} for {patient_id}")
        self.send_json(201, {"id": report_id})

    def delete_report(self, conn, report_id):
        user = self.require(conn, "reports.delete")
        if not user:
            return
        deleted = conn.execute("DELETE FROM reports WHERE id = ?", (report_id,)).rowcount
        if not deleted:
            self.send_json(404, {"error": "Report not found"})
            return
        audit(conn, user, "report.delete", f"Deleted {report_id}")
        self.send_json(200, {"ok": True})

    def analytics(self, conn):
        if not self.require(conn, "analytics.read"):
            return
        patients = [json.loads(row["payload"]) for row in conn.execute("SELECT payload FROM patients").fetchall()]
        scans = [scan for patient in patients for scan in patient.get("scans", [])]
        users = conn.execute("SELECT role, active FROM users").fetchall()
        cohort = cohort_counts(patients)
        self.send_json(200, {
            "patients": len(patients),
            "scans": len(scans),
            "reports": conn.execute("SELECT COUNT(*) AS n FROM reports").fetchone()["n"],
            "users": len(users),
            "activeUsers": sum(1 for user in users if user["active"]),
            "improved": cohort["improved"],
            "stable": cohort["stable"],
            "worsened": cohort["worsened"],
            "baseline": cohort["baseline"],
            "referable": cohort["referable"],
            "stages": cohort["stages"],
        })

    def list_users(self, conn):
        if not self.require(conn, "users.manage"):
            return
        rows = conn.execute("SELECT * FROM users ORDER BY created_at ASC").fetchall()
        self.send_json(200, {"users": [public_user(row) for row in rows]})

    def create_user(self, conn):
        actor = self.require(conn, "users.manage")
        if not actor:
            return
        data = self.read_json()
        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        role = data.get("role")
        password = data.get("password", "")
        if role not in ROLES or len(name) < 2 or not email_ok(email) or not password_ok(password):
            self.send_json(400, {"error": "Name, valid email, role, and a 12 character password with a letter and a number are required"})
            return
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            self.send_json(409, {"error": "That email is already registered"})
            return
        created = self.insert_user(conn, name, email, password, role, bool(data.get("active", True)))
        audit(conn, actor, "user.create", f"{created['id']} {email} as {role}")
        self.send_json(201, {"user": public_user(created)})

    def update_user(self, conn, user_id):
        actor = self.require(conn, "users.manage")
        if not actor:
            return
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            self.send_json(404, {"error": "Account not found"})
            return
        data = self.read_json()
        role = data.get("role", row["role"])
        active = row["active"] if "active" not in data else (1 if data.get("active") else 0)
        name = str(data.get("name", row["name"])).strip()
        if role not in ROLES or len(name) < 2:
            self.send_json(400, {"error": "A valid name and role are required"})
            return
        if row["role"] == "super_admin" and (role != "super_admin" or not active):
            others = conn.execute(
                "SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND active = 1 AND id != ?",
                (user_id,),
            ).fetchone()["n"]
            if others == 0:
                self.send_json(400, {"error": "The last active Super Admin cannot be removed or deactivated"})
                return
        password = data.get("password")
        if password:
            if not password_ok(password):
                self.send_json(400, {"error": "Replacement passwords need 12 characters, a letter, and a number"})
                return
            salt, digest = hash_password(password)
            conn.execute(
                "UPDATE users SET name = ?, role = ?, active = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
                (name, role, active, digest, salt, now_iso(), user_id),
            )
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        else:
            conn.execute(
                "UPDATE users SET name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?",
                (name, role, active, now_iso(), user_id),
            )
            if not active:
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        audit(conn, actor, "user.update", f"{user_id} role {role} active {bool(active)}")
        updated = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        self.send_json(200, {"user": public_user(updated)})

    def list_audit(self, conn):
        if not self.require(conn, "audit.read"):
            return
        rows = conn.execute(
            "SELECT id, created_at, actor_email, action, detail FROM audit_log ORDER BY id DESC LIMIT 200"
        ).fetchall()
        self.send_json(200, {"events": [dict(row) for row in rows]})

    def serve_static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        relative = os.path.normpath(unquote(path).lstrip("/"))
        if relative.startswith("..") or relative.startswith("data") or relative.startswith("backend"):
            self.send_error(403)
            return
        full = os.path.join(ROOT, relative)
        if not os.path.isfile(full):
            self.send_error(404)
            return
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as handle:
            content = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def make_server(host):
    if ":" in host:
        class V6Server(ThreadingHTTPServer):
            address_family = socket.AF_INET6
            allow_reuse_address = True
        return V6Server((host, PORT), App)
    server = ThreadingHTTPServer((host, PORT), App)
    server.allow_reuse_address = True
    return server


def main():
    init_db()
    servers = []
    for host in ("127.0.0.1", "::1"):
        try:
            servers.append(make_server(host))
            print(f"RetinaGuard API listening on http://{host if ':' not in host else '[' + host + ']'}:{PORT}", flush=True)
        except OSError as exc:
            print(f"Could not listen on {host}: {exc}", flush=True)
    if not servers:
        raise SystemExit("The API could not start. Port 8080 is already in use.")
    print("Open http://127.0.0.1:8080", flush=True)
    print("The first account created in the browser becomes the Super Admin. No default password is created.", flush=True)
    threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in servers[1:]]
    for thread in threads:
        thread.start()
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        for server in servers:
            server.shutdown()


if __name__ == "__main__":
    main()
