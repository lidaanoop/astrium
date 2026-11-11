import json
import os
import re
import secrets
from datetime import date, datetime, timezone

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHECKINS_FILE = os.path.join(BASE_DIR, "checkins.json")

PHONE_RE = re.compile(r"^[6-9]\d{9}$")

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
    if len(aadhaar) != 12:
        errors["aadhaar"] = "Aadhaar number must be 12 digits."
    elif aadhaar[0] in {"0", "1"}:
        errors["aadhaar"] = "Aadhaar number cannot start with 0 or 1."
    elif not verhoeff_is_valid(aadhaar):
        errors["aadhaar"] = "This Aadhaar number is invalid. Please check the digits."

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


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/checkin", methods=["POST"])
def create_checkin():
    payload = request.get_json(silent=True) or {}
    errors = validate_checkin(payload)

    if errors:
        return jsonify({"ok": False, "errors": errors}), 400

    aadhaar = re.sub(r"\D", "", str(payload.get("aadhaar", "")))
    reference = f"AST-{secrets.token_hex(3).upper()}"

    record = {
        "reference": reference,
        "name": str(payload.get("name", "")).strip(),
        "phone": re.sub(r"\D", "", str(payload.get("phone", ""))),
        "address": str(payload.get("address", "")).strip(),
        "aadhaar_masked": mask_aadhaar(aadhaar),
        "aadhaar_verified": True,
        "aadhaar_file_name": str(payload.get("aadhaar_file_name", "")).strip(),
        "check_in": str(payload.get("check_in", "")).strip(),
        "check_out": str(payload.get("check_out", "")).strip(),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    records = load_checkins()
    records.append(record)
    save_checkins(records)

    return jsonify({"ok": True, "reference": reference}), 201


if __name__ == "__main__":
    app.run(debug=True)
