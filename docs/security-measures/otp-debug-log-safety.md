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

Important: `OTP_DEBUG_LOG_CODES` is read by the **Convex backend runtime** (`process.env` in `convex/authOtp.ts`).
Setting it only in the frontend app `.env.local` (for example `eyymi_tanstack/.env.local` or `openspa_tanstack/.env.local`) does **not** enable backend OTP logs.

### Required steps (works for original and cloned repos)

1. Make sure the frontend and backend point to the **same Convex deployment**

- Frontend: `VITE_CONVEX_URL` in the TanStack app `.env.local`
- Backend: `CONVEX_DEPLOYMENT` / `CONVEX_URL` in the Convex backend `.env.local`

If they point to different deployments, OTP requests will hit one deployment while you watch logs from another.

2. Set the debug flag in the **Convex deployment runtime env** (not just local files)

Run this inside the backend repo you are using:

```powershell
npx convex env set OTP_DEBUG_LOG_CODES true
npx convex env list
```

3. Restart the backend dev process

```powershell
npm run dev
```

4. Request an OTP again and watch the backend terminal

You should see:

- `[otp.dev] challenge_created`
- the generated `code`

### Examples

Original repo (`eyymi_backend_convex`):

- align with the `eyymi_tanstack` `VITE_CONVEX_URL`
- then run `npx convex env set OTP_DEBUG_LOG_CODES true` in `eyymi_backend_convex`

Cloned repo (`openspa_backend_convex`):

- align with the `openspa_tanstack` `VITE_CONVEX_URL`
- then run `npx convex env set OTP_DEBUG_LOG_CODES true` in `openspa_backend_convex`

### Troubleshooting (most common issue)

If OTP is working but the debug code is not printed:

- Check whether frontend and backend are using different Convex deployments
- Confirm `npx convex env list` shows `OTP_DEBUG_LOG_CODES=true` for the active deployment
- Restart `npm run dev` after changing backend `.env.local`
- Ignore `OTP_DEBUG_LOG_CODES` in the frontend `.env.local` (it does not control Convex server logs)

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
