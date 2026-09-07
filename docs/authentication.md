# Authentication implementation

## Scope

Milestone 5 implements API authentication and session security. Mobile secure storage and authentication screens remain Milestone 9.

Implemented routes under `/v1/auth`:

- Register and login with bounded device metadata.
- Atomically rotate opaque refresh credentials.
- Revoke the current session, all sessions, or a selected owned session.
- List sanitized active sessions.
- Request and consume single-use password resets.

## Credentials

Passwords use Argon2id with 19,456 KiB memory, two iterations, one lane, and a 32-byte output. Five local measurements averaged 24 ms on the current container. These parameters are the development baseline and must be recalibrated on production hardware against latency and concurrency budgets.

Access tokens are Ed25519-signed JWTs with an explicit `EdDSA` header, issuer, audience, subject, session ID, unique token ID, issued-at time, and a 10-minute default expiry. Protected requests validate the signature and claims, then confirm the backing session is active so logout and reset revocation take effect immediately.

Refresh tokens contain 256 random bits. Only their SHA-256 fingerprint is stored. Every rotation creates an immutable lineage record and marks the prior record rotated in a MongoDB transaction. Replaying any rotated credential revokes the token family. Rotation does not extend the session's absolute 30-day default expiry.

## Password recovery

Reset credentials contain 256 random bits, expire after 15 minutes by default, are stored only as fingerprints, and are consumed atomically. A successful reset updates the password and revokes every active session in the same transaction.

Forgot-password responses do not disclose account existence. Sensitive rate-limit identifiers are hashed. The service exposes a delivery adapter; the safe default deliberately does not deliver or log reset links. A queued production email adapter and approved universal/app-link domain are required before deployment.

## Distributed limits

Redis uses an atomic Lua increment-and-expiry operation. Current starting limits are:

- Registration: 5 per IP per hour.
- Login: 5 per normalized-account-and-IP key per 15 minutes.
- Refresh: 30 per session per 15 minutes; invalid credentials use their hashed fingerprint as the limit key.
- Forgot password: 3 per normalized account and 5 per IP per hour.

Responses use `429 RATE_LIMITED` with bounded `retryAfterSeconds`. Thresholds require load and abuse testing before launch.

## Collections and indexes

Authentication adds `users`, `sessions`, `refresh_tokens`, and `password_reset_tokens`. Index declarations are explicit while Mongoose automatic index creation remains disabled. Apply additive indexes deliberately with:

```bash
yarn db:indexes:create
```

Production index changes require review, monitoring, backups, and a rollout plan.

## Key generation

Generate an Ed25519 pair outside the repository and base64-encode the complete PKCS#8 private PEM and SPKI public PEM into the configured secret store. Never commit either production key. Rotation and emergency key-compromise procedures remain deployment work; multi-key verification will be added before a live rotation is required.

## Manual integration verification

With MongoDB and Redis running, configure the API, create indexes, start it, and exercise register, refresh, replay, session listing, logout, login, forgot/reset, and post-reset session rejection. Confirm no plaintext password, access token, refresh token, or reset token appears in MongoDB or logs.

Docker is unavailable in the current execution environment, so the real transaction, TTL-index, Redis Lua, and process-level flow remain manual integration checks.
