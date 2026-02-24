# Minimal Phone Auth Schema (MVP)

Purpose: Define the smallest production-usable schema for phone OTP authentication before expanding into full auth/account features.

Scope: Phone number login/signup via OTP, verification attempts, and session persistence.

## MVP Assumptions

- Phone auth uses SMS OTP (6 digits).
- Phone numbers are stored in E.164 format (example: `+639171234567`).
- OTP codes are never stored in plaintext; store only a hash.
- One user account per unique verified phone number.
- Session model uses refresh token rotation (hashed token stored server-side).

## Core Tables

### 1) `users`

Minimal account identity record.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | Primary key |
| `phone_e164` | VARCHAR(20) | Yes | Unique after verification (recommended unique always) |
| `phone_verified_at` | TIMESTAMP NULL | No | Set when OTP is successfully verified |
| `status` | VARCHAR(20) | Yes | `active`, `blocked`, `deleted` (soft-delete status) |
| `created_at` | TIMESTAMP | Yes | Default now |
| `updated_at` | TIMESTAMP | Yes | Default now, update on write |
| `last_login_at` | TIMESTAMP NULL | No | Optional but useful for ops/support |

Indexes / constraints:
- `PRIMARY KEY (id)`
- `UNIQUE (phone_e164)`
- Index on `status`

### 2) `phone_otp_challenges`

Tracks OTP send + verify attempts. One row per OTP request/challenge.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | Primary key |
| `phone_e164` | VARCHAR(20) | Yes | Target phone |
| `otp_code_hash` | VARCHAR(255) | Yes | Hash of OTP code + salt/pepper strategy |
| `purpose` | VARCHAR(20) | Yes | `login`, `signup`, `reverify` |
| `status` | VARCHAR(20) | Yes | `pending`, `verified`, `expired`, `failed`, `consumed` |
| `attempt_count` | INT | Yes | Verification attempts used |
| `max_attempts` | INT | Yes | Usually `3` or `5` |
| `resend_count` | INT | Yes | Count of sends for this challenge/session |
| `expires_at` | TIMESTAMP | Yes | OTP expiry time |
| `verified_at` | TIMESTAMP NULL | No | Set when code is verified |
| `consumed_at` | TIMESTAMP NULL | No | Set when challenge is exchanged for session |
| `provider_message_id` | VARCHAR(100) NULL | No | SMS provider delivery reference |
| `ip_address` | VARCHAR(45) NULL | No | IPv4/IPv6 for abuse monitoring |
| `device_id` | VARCHAR(128) NULL | No | Optional app-generated device identifier |
| `created_at` | TIMESTAMP | Yes | Default now |
| `updated_at` | TIMESTAMP | Yes | Default now, update on write |

Indexes / constraints:
- `PRIMARY KEY (id)`
- Index on `(phone_e164, created_at DESC)`
- Index on `status`
- Index on `expires_at`

Notes:
- Keep old challenge rows for audit and rate-limit analysis (with retention policy later).
- Mark challenge `consumed` after session creation to prevent replay.

### 3) `auth_sessions`

Stores active login sessions (server-side refresh token tracking).

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | UUID | Yes | Primary key |
| `user_id` | UUID | Yes | FK to `users.id` |
| `refresh_token_hash` | VARCHAR(255) | Yes | Hash only, never raw token |
| `device_id` | VARCHAR(128) NULL | No | App install/device identifier |
| `platform` | VARCHAR(20) NULL | No | `ios`, `android` |
| `app_version` | VARCHAR(30) NULL | No | Useful for support/debugging |
| `ip_address` | VARCHAR(45) NULL | No | Last known IP |
| `user_agent` | VARCHAR(255) NULL | No | Optional, can be sparse on mobile |
| `created_at` | TIMESTAMP | Yes | Default now |
| `last_seen_at` | TIMESTAMP NULL | No | Update on refresh/use |
| `expires_at` | TIMESTAMP | Yes | Session expiry |
| `revoked_at` | TIMESTAMP NULL | No | Set on logout/revoke |

Indexes / constraints:
- `PRIMARY KEY (id)`
- `FOREIGN KEY (user_id) REFERENCES users(id)`
- `UNIQUE (refresh_token_hash)`
- Index on `user_id`
- Index on `expires_at`
- Index on `revoked_at`

## Minimal Auth Flow (Mapped to Schema)

1. User submits phone number.
2. Server creates `phone_otp_challenges` row (`pending`) and sends OTP.
3. User submits OTP code + challenge ID (or phone + code).
4. Server verifies hash, expiry, and attempts.
5. Server creates/fetches `users` row and sets `phone_verified_at`.
6. Server creates `auth_sessions` row and returns access token + refresh token.
7. Challenge row is marked `verified` then `consumed`.

## Validation Rules (MVP)

- Normalize all phone numbers to E.164 before DB write.
- OTP expiry: `5 minutes` (recommended MVP default).
- Max verify attempts: `5` (recommended MVP default).
- Resend cooldown: `30-60 seconds` (enforced in app + backend).
- Block login if `users.status != active`.

## What Is Intentionally Not Included (Yet)

- Social login providers
- Email/password auth
- Device trust scoring
- Biometric unlock (client-side only concern)
- Full audit/event log table
- Advanced rate-limit tables (Redis/in-memory can handle MVP)

## Confirmations Needed (Short List)

1. OTP expiry window (`3`, `5`, or `10` minutes)
2. Max OTP attempts (`3` or `5`)
3. Session expiry policy (for refresh token), e.g. `30 days`
4. Phone uniqueness policy for deleted users (reuse phone allowed or blocked)
5. DB engine (`Postgres` recommended)
