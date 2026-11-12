# Astrium Estates

Flask marketing site with guest check-in and a private admin dashboard.

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open <http://127.0.0.1:5000>.

## Guest check-in

The **Check In** button in the header opens a modal form with:

- Full name, phone (+91) and address
- Aadhaar number, verified with an **OTP** flow (see below)
- Check-in and check-out dates with past-date and ordering validation

Submissions are validated again on the server (`POST /api/checkin`) and stored in
`checkins.json` with a booking reference. Aadhaar numbers are stored masked
(`XXXX XXXX 1234`).

## Aadhaar OTP verification

1. `POST /api/aadhaar/send-otp` validates the number (12 digits + Verhoeff
   checksum), generates a 6-digit OTP and binds it to the browser session.
2. `POST /api/aadhaar/verify-otp` checks the code and marks the session as
   verified for 30 minutes.
3. `POST /api/checkin` refuses to save a record unless the session was verified
   for that exact Aadhaar number; the verification is single-use.

Safeguards: OTP expires after 5 minutes, resend is throttled to one per 30
seconds, five wrong attempts invalidate the code, codes are stored hashed, and an
OTP issued in one session cannot be redeemed from another.

### SMS gateway (required)

OTPs are **only** delivered by SMS — there is no demo mode. If no gateway is
configured, `POST /api/aadhaar/send-otp` returns `503` and no code is issued, and
the server logs a warning at startup:

```
WARNING in app: Aadhaar OTP delivery is DISABLED: no SMS gateway configured. ...
```

To enable it, copy `.env.example` to `.env`, fill in a provider, and restart the
app (`.env` is loaded automatically and is git-ignored):

```ini
# .env — Fast2SMS example
SMS_PROVIDER=fast2sms
FAST2SMS_API_KEY=your-key
SMS_SENDER_ID=ASTRIM
```

Also supported: `SMS_PROVIDER=msg91` (`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`) and
`SMS_PROVIDER=twilio` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER`). Environment variables take precedence over `.env`.

If the gateway rejects the message the endpoint returns `502` so the guest sees
an error instead of waiting for a code that never arrives.

> These gateways send the OTP to the number typed into the form. A true
> **UIDAI Aadhaar OTP** can only be delivered to the mobile registered against
> the Aadhaar, which requires a UIDAI-approved AUA/ASA/KUA partner (Surepass,
> Karza, Digio, Signzy, Sandbox). Swap the body of `send_otp_sms()` — and its
> verification step — for that provider’s send/verify APIs when you have
> credentials.

OTP and verification state live in memory (`OTP_STORE`, `VERIFIED_STORE`); swap
these for Redis or a database when running multiple workers.

## Admin dashboard

- URL: <http://127.0.0.1:5000/admin>
- Default credentials: `admin` / `astrium123`
- Override with environment variables before starting the app:

```bash
export ADMIN_USERNAME=your-user
export ADMIN_PASSWORD=your-strong-password
export SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
.venv/bin/python app.py
```

The dashboard is protected by a server-side session; visiting `/admin` while
signed out redirects to `/admin/login`. It lists every check-in with totals,
search, status filters (in house / upcoming / completed) and a delete action.

## Files

| Path | Purpose |
| --- | --- |
| `app.py` | Routes, validation, auth, JSON storage |
| `templates/index.html` | Public site + check-in modal |
| `templates/admin_login.html` | Staff sign-in |
| `templates/admin.html` | Check-in dashboard |
| `static/main.js` | Carousel + check-in modal logic |
| `static/admin.js` | Dashboard search, filters, delete confirm |
| `static/styles.css` / `static/admin.css` | Public / admin styling |
| `checkins.json` | Guest records (git-ignored, holds personal data) |
| `.secret_key` | Auto-generated Flask session key (git-ignored) |
