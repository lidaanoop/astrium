import functools
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import date, datetime, timezone

from flask import (
    Flask,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHECKINS_FILE = os.path.join(BASE_DIR, "checkins.json")

PHONE_RE = re.compile(r"^[6-9]\d{9}$")

# Admin credentials — override with environment variables in production.
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "astrium123")

# Aadhaar OTP settings. Set AADHAAR_DEMO_MODE=0 once a real SMS/UIDAI gateway is
# wired into send_otp_sms() — otherwise the OTP is echoed back to the form so the
# flow can be tested without an SMS provider.
AADHAAR_DEMO_MODE = os.environ.get("AADHAAR_DEMO_MODE", "1").strip().lower() not in {
    "0",
    "false",
    "no",
}
OTP_TTL_SECONDS = 300
OTP_RESEND_SECONDS = 30
OTP_MAX_ATTEMPTS = 5
VERIFICATION_TTL_SECONDS = 1800

# In-memory, per-session state. Swap for Redis/DB for multi-process deployments.
OTP_STORE: dict = {}
VERIFIED_STORE: dict = {}


def load_secret_key() -> str:
    """Use SECRET_KEY from the environment, else a key persisted on disk."""
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        return env_key

    key_file = os.path.join(BASE_DIR, ".secret_key")
    try:
        if os.path.exists(key_file):
            with open(key_file, encoding="utf-8") as handle:
                saved = handle.read().strip()
            if saved:
                return saved
        generated = secrets.token_hex(32)
        with open(key_file, "w", encoding="utf-8") as handle:
            handle.write(generated)
        return generated
    except OSError:
        return secrets.token_hex(32)


app.secret_key = load_secret_key()

# Verhoeff algorithm tables — used to validate the Aadhaar checksum digit.
VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def verhoeff_is_valid(number: str) -> bool:
    """Return True when an Aadhaar-style number passes the Verhoeff checksum."""
    checksum = 0
    for index, char in enumerate(reversed(number)):
        checksum = VERHOEFF_D[checksum][VERHOEFF_P[index % 8][int(char)]]
    return checksum == 0


def load_checkins() -> list:
    if not os.path.exists(CHECKINS_FILE):
        return []
    try:
        with open(CHECKINS_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


def save_checkins(records: list) -> None:
    with open(CHECKINS_FILE, "w", encoding="utf-8") as handle:
        json.dump(records, handle, indent=2, ensure_ascii=False)


def mask_aadhaar(digits: str) -> str:
    return f"XXXX XXXX {digits[-4:]}"


def to_date(value: str):
    """Parse an ISO date string, returning None when it is not valid."""
    try:
        return datetime.strptime(str(value or "").strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def stay_status(record: dict) -> str:
    check_in = to_date(record.get("check_in"))
    check_out = to_date(record.get("check_out"))
    if not check_in or not check_out:
        return "Unknown"

    today = date.today()
    if today < check_in:
        return "Upcoming"
    if today >= check_out:
        return "Completed"
    return "In house"


def stay_nights(record: dict):
    check_in = to_date(record.get("check_in"))
    check_out = to_date(record.get("check_out"))
    if not check_in or not check_out:
        return ""
    return max((check_out - check_in).days, 0)


def admin_required(view):
    """Block access to admin views unless a staff session is active."""

    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("is_admin"):
            return redirect(url_for("admin_login"))
        return view(*args, **kwargs)

    return wrapped


# ------------------------------------------------------- Aadhaar OTP helpers


def validate_aadhaar_number(digits: str) -> str:
    """Return an error message for an invalid Aadhaar number, else ''."""
    if len(digits) != 12:
        return "Aadhaar number must be 12 digits."
    if digits[0] in {"0", "1"}:
        return "Aadhaar number cannot start with 0 or 1."
    if not verhoeff_is_valid(digits):
        return "This Aadhaar number is invalid. Please check the digits."
    return ""


def current_session_id() -> str:
    """Stable id used to bind OTP requests to one browser session."""
    sid = session.get("sid")
    if not sid:
        sid = secrets.token_hex(16)
        session["sid"] = sid
    return sid


def purge_expired_otps() -> None:
    now = time.time()
    for key, record in list(OTP_STORE.items()):
        if record["expires_at"] + 60 < now:
            OTP_STORE.pop(key, None)


def otp_digest(request_id: str, otp: str) -> str:
    """Hash the OTP so the plain code never sits in memory."""
    return hashlib.sha256(
        f"{request_id}:{otp}:{app.secret_key}".encode("utf-8")
    ).hexdigest()


def send_otp_sms(aadhaar: str, otp: str) -> None:
    """Hook for a real SMS/UIDAI gateway.

    Replace this with the provider call (e.g. Surepass, Karza, Digio). UIDAI
    only sends the OTP to the mobile number registered against the Aadhaar, so
    the provider — not this app — must own delivery.
    """
    app.logger.info("Aadhaar OTP for %s: %s", mask_aadhaar(aadhaar), otp)


def session_aadhaar_verified(aadhaar: str) -> bool:
    record = VERIFIED_STORE.get(session.get("sid", ""))
    if not record:
        return False
    if record["aadhaar"] != aadhaar:
        return False
    if time.time() - record["verified_at"] > VERIFICATION_TTL_SECONDS:
        VERIFIED_STORE.pop(session.get("sid", ""), None)
        return False
    return True


def validate_checkin(payload: dict) -> dict:
    """Return a dict of field -> error message. Empty dict means valid."""
    errors = {}

    name = str(payload.get("name", "")).strip()
    if len(name) < 3:
        errors["name"] = "Please enter your full name."

    phone_digits = re.sub(r"\D", "", str(payload.get("phone", "")))
    if not PHONE_RE.match(phone_digits):
        errors["phone"] = "Enter a valid 10-digit mobile number."

    address = str(payload.get("address", "")).strip()
    if len(address) < 10:
        errors["address"] = "Please enter your full address."

    aadhaar = re.sub(r"\D", "", str(payload.get("aadhaar", "")))
    aadhaar_problem = validate_aadhaar_number(aadhaar)
    if aadhaar_problem:
        errors["aadhaar"] = aadhaar_problem

    check_in = check_out = None
    for key in ("check_in", "check_out"):
        raw = str(payload.get(key, "")).strip()
        try:
            parsed = datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            errors[key] = "Select a valid date."
            continue
        if key == "check_in":
            check_in = parsed
        else:
            check_out = parsed

    if check_in and check_in < date.today():
        errors["check_in"] = "Check-in date cannot be in the past."

    if check_in and check_out and check_out <= check_in:
        errors["check_out"] = "Check-out must be after check-in."

    return errors


@app.route("/api/aadhaar/send-otp", methods=["POST"])
def send_aadhaar_otp():
    """Validate the Aadhaar number and send a 6-digit OTP to its mobile number."""
    payload = request.get_json(silent=True) or {}
    aadhaar = re.sub(r"\D", "", str(payload.get("aadhaar", "")))

    problem = validate_aadhaar_number(aadhaar)
    if problem:
        return jsonify({"ok": False, "errors": {"aadhaar": problem}}), 400

    purge_expired_otps()
    sid = current_session_id()
    now = time.time()

    existing = OTP_STORE.get(sid)
    if existing and existing["aadhaar"] == aadhaar:
        wait_for = existing["sent_at"] + OTP_RESEND_SECONDS - now
        if wait_for > 0:
            return (
                jsonify(
                    {
                        "ok": False,
                        "message": f"Please wait {int(wait_for) + 1}s before requesting another OTP.",
                        "retry_after": int(wait_for) + 1,
                    }
                ),
                429,
            )

    otp = f"{secrets.randbelow(1_000_000):06d}"
    request_id = secrets.token_hex(8)

    OTP_STORE[sid] = {
        "request_id": request_id,
        "aadhaar": aadhaar,
        "code_hash": otp_digest(request_id, otp),
        "sent_at": now,
        "expires_at": now + OTP_TTL_SECONDS,
        "attempts": 0,
    }

    send_otp_sms(aadhaar, otp)

    response = {
        "ok": True,
        "request_id": request_id,
        "masked": mask_aadhaar(aadhaar),
        "expires_in": OTP_TTL_SECONDS,
        "resend_in": OTP_RESEND_SECONDS,
    }
    if AADHAAR_DEMO_MODE:
        response["demo_otp"] = otp

    return jsonify(response)


@app.route("/api/aadhaar/verify-otp", methods=["POST"])
def verify_aadhaar_otp():
    """Check the OTP for this session and unlock check-in for the Aadhaar."""
    payload = request.get_json(silent=True) or {}
    otp = re.sub(r"\D", "", str(payload.get("otp", "")))
    request_id = str(payload.get("request_id", ""))
    sid = session.get("sid", "")
    record = OTP_STORE.get(sid)

    if not record or record["request_id"] != request_id:
        return (
            jsonify({"ok": False, "message": "Request a new OTP to continue."}),
            400,
        )

    if record["expires_at"] < time.time():
        OTP_STORE.pop(sid, None)
        return (
            jsonify(
                {
                    "ok": False,
                    "expired": True,
                    "message": "This OTP has expired. Please request a new one.",
                }
            ),
            410,
        )

    if len(otp) != 6:
        return jsonify({"ok": False, "message": "Enter the 6-digit OTP."}), 400

    if not hmac.compare_digest(record["code_hash"], otp_digest(request_id, otp)):
        record["attempts"] += 1
        attempts_left = OTP_MAX_ATTEMPTS - record["attempts"]
        if attempts_left <= 0:
            OTP_STORE.pop(sid, None)
            return (
                jsonify(
                    {
                        "ok": False,
                        "message": "Too many incorrect attempts. Please request a new OTP.",
                    }
                ),
                429,
            )
        return (
            jsonify(
                {
                    "ok": False,
                    "message": f"Incorrect OTP. {attempts_left} attempt"
                    f"{'s' if attempts_left != 1 else ''} left.",
                    "attempts_left": attempts_left,
                }
            ),
            400,
        )

    OTP_STORE.pop(sid, None)
    VERIFIED_STORE[sid] = {
        "aadhaar": record["aadhaar"],
        "verified_at": time.time(),
    }

    return jsonify(
        {
            "ok": True,
            "verified": True,
            "aadhaar_masked": mask_aadhaar(record["aadhaar"]),
        }
    )


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/checkin", methods=["POST"])
def create_checkin():
    payload = request.get_json(silent=True) or {}
    errors = validate_checkin(payload)
    aadhaar = re.sub(r"\D", "", str(payload.get("aadhaar", "")))

    if not errors and not session_aadhaar_verified(aadhaar):
        errors["aadhaar"] = "Verify your Aadhaar with the OTP before checking in."

    if errors:
        return jsonify({"ok": False, "errors": errors}), 400

    reference = f"AST-{secrets.token_hex(3).upper()}"

    record = {
        "reference": reference,
        "name": str(payload.get("name", "")).strip(),
        "phone": re.sub(r"\D", "", str(payload.get("phone", ""))),
        "address": str(payload.get("address", "")).strip(),
        "aadhaar_masked": mask_aadhaar(aadhaar),
        "aadhaar_verified": True,
        "aadhaar_verified_via": "OTP",
        "check_in": str(payload.get("check_in", "")).strip(),
        "check_out": str(payload.get("check_out", "")).strip(),
        "nights": stay_nights(payload),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    records = load_checkins()
    records.append(record)
    save_checkins(records)

    # Verification tokens are single-use.
    VERIFIED_STORE.pop(session.get("sid", ""), None)

    return jsonify({"ok": True, "reference": reference}), 201


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if session.get("is_admin"):
        return redirect(url_for("admin_dashboard"))

    error = None

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if hmac.compare_digest(username, ADMIN_USERNAME) and hmac.compare_digest(
            password, ADMIN_PASSWORD
        ):
            session.clear()
            session["is_admin"] = True
            session["admin_user"] = username
            return redirect(url_for("admin_dashboard"))

        error = "Invalid username or password. Please try again."

    status = 401 if error else 200
    return render_template("admin_login.html", error=error), status


@app.route("/admin")
@admin_required
def admin_dashboard():
    records = list(reversed(load_checkins()))

    for record in records:
        record["status"] = stay_status(record)
        record["nights"] = stay_nights(record)

        for key in ("check_in", "check_out"):
            parsed = to_date(record.get(key))
            record[f"{key}_label"] = parsed.strftime("%d %b %Y") if parsed else "—"

        record["submitted_label"] = (
            str(record.get("created_at", "")).replace("T", " ")[:16] or "—"
        )

    stats = {
        "total": len(records),
        "in_house": sum(1 for record in records if record["status"] == "In house"),
        "upcoming": sum(1 for record in records if record["status"] == "Upcoming"),
        "completed": sum(1 for record in records if record["status"] == "Completed"),
    }

    return render_template(
        "admin.html",
        records=records,
        stats=stats,
        admin_user=session.get("admin_user", ADMIN_USERNAME),
    )


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    session.clear()
    return redirect(url_for("admin_login"))


@app.route("/admin/checkins/<reference>/delete", methods=["POST"])
@admin_required
def admin_delete_checkin(reference: str):
    records = load_checkins()
    remaining = [item for item in records if item.get("reference") != reference]

    if len(remaining) == len(records):
        flash("That check-in record no longer exists.", "error")
    else:
        save_checkins(remaining)
        flash(f"Check-in {reference} was deleted.", "success")

    return redirect(url_for("admin_dashboard"))


if __name__ == "__main__":
    app.run(debug=True)
