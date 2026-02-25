# OTP Debug Log Safety (Reader-Friendly)

## What this protects

When testing OTP login in development, we sometimes want the OTP code to appear in Convex logs so we can copy it quickly.

That is helpful in dev, but it is dangerous in production.

This project now has a safety rule:

- `OTP_DEBUG_LOG_CODES=true` can enable OTP code logging
- But if the deployment is production (`tacit-woodpecker-977`), OTP code logging is **forced OFF**

This means a mistaken production env variable will **not** leak OTP codes.

## How it works (simple version)

The backend checks:

1. Is `OTP_DEBUG_LOG_CODES` enabled?
2. Is this deployment production (`CONVEX_DEPLOYMENT=tacit-woodpecker-977`)?

If both are true:

- OTP code logging is refused
- A warning is logged (without printing the OTP code)

## Dev setup (allowed)

For development deployment `adept-seahorse-877`, set:

- `OTP_DEBUG_LOG_CODES=true`

Then OTP request logs can show:

- `[otp.dev] challenge_created`
- including the generated `code`

## Prod setup (must stay off)

For production deployment `tacit-woodpecker-977`:

- Do **not** set `OTP_DEBUG_LOG_CODES`
- Or set it to `false`

Even if someone sets it to `true` by mistake, the code blocks OTP logging in production.

## Why this is best practice

- Prevents accidental OTP leaks in production logs
- Keeps developer convenience in dev
- Fails closed (safe by default when something is misconfigured)

## Related file

- `convex/authOtp.ts`

