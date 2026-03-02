# Environment

Last verified against current env reads in [`../../convex/authOtp.ts`](../../convex/authOtp.ts), [`../../convex/authSessions.ts`](../../convex/authSessions.ts), [`../../convex/meetingPlaces.ts`](../../convex/meetingPlaces.ts), and [`../../convex/routes.ts`](../../convex/routes.ts) on **March 2, 2026**.

## Local Repo Env And Deployment Alignment

- The backend README expects a local `.env.local` in the backend repo root.
- Convex runtime code reads env values through `process.env` inside Convex functions and actions.
- The frontend repo uses `VITE_CONVEX_URL`, which is **not** a backend env var, but it must point to the same deployment as the backend's Convex setup.
- The existing security note in [`../security-measures/otp-debug-log-safety.md`](../security-measures/otp-debug-log-safety.md) is still relevant when debugging OTP locally.

## Runtime Environment Variables Actually Used

| Variable | Used in | Directly read by code | Required | Default if missing | Security / placement notes |
| --- | --- | --- | --- | --- | --- |
| `CONVEX_URL` | Backend setup and deployment alignment | No direct read in current Convex source files | Required for real local/dev deployment wiring | No code fallback | Keep in backend `.env.local` or Convex setup context; not a secret by itself but must match the active deployment |
| `CONVEX_DEPLOYMENT` | OTP debug-log guard | Yes, in `authOtp.ts` | Required for correct deployment-aware behavior | Empty string | Runtime env in Convex context; used to block OTP debug logging in production deployment |
| `OTP_HASH_PEPPER` | OTP code hashing and session-token hashing | Yes, in `authOtp.ts` and `authSessions.ts` | Required outside local development | Falls back to `eyymi-dev-otp-pepper-change-me` | Sensitive. Treat as a secret in Convex runtime env. Current fallback is unsafe for non-local use |
| `OTP_DEBUG_LOG_CODES` | Dev OTP debug logging | Yes, in `authOtp.ts` | Optional, dev only | Disabled | Runtime env only. Never rely on frontend `.env.local` for this. Force-disabled in the hard-coded production deployment name |
| `TOMTOM_ROUTING_API_KEY` | Route recompute and search fallback | Yes, in `routes.ts` and indirectly in `meetingPlaces.ts` | Required for routing; also used as search fallback | Empty string | Sensitive API key. Store in Convex runtime env |
| `TOMTOM_ROUTING_BASE_URL` | TomTom routing endpoint override | Yes, in `routes.ts` | Optional | `https://api.tomtom.com` | Runtime env. Usually only overridden for testing or proxying |
| `TOMTOM_SEARCH_API_KEY` | Meeting-place search | Yes, in `meetingPlaces.ts` | Optional if routing key is present; otherwise required for search | Falls back to `TOMTOM_ROUTING_API_KEY`, then empty string | Sensitive API key. Store in Convex runtime env |
| `TOMTOM_SEARCH_BASE_URL` | TomTom search endpoint override | Yes, in `meetingPlaces.ts` | Optional | `https://api.tomtom.com` | Runtime env. Usually only overridden for testing or proxying |

## Variable-By-Variable Notes

### `CONVEX_URL`

- Where it matters: deployment wiring and local setup, as described in [`../../README.md`](../../README.md).
- Current code behavior: no direct `process.env.CONVEX_URL` read exists in the checked-in Convex source files.
- Required status: operationally required for working against a real Convex deployment.
- Default behavior: none in code.
- Placement: backend repo `.env.local` / Convex CLI environment context.

### `CONVEX_DEPLOYMENT`

- Where used: [`../../convex/authOtp.ts`](../../convex/authOtp.ts).
- Current behavior: compared against a hard-coded production deployment allowlist/denylist for OTP debug log safety.
- Required status: optional for code execution, but effectively required if you want the production debug-log guard to evaluate correctly.
- Default behavior: empty string, so only explicit matches trigger the production guard.
- Placement: Convex runtime env.

### `OTP_HASH_PEPPER`

- Where used: [`../../convex/authOtp.ts`](../../convex/authOtp.ts), [`../../convex/authSessions.ts`](../../convex/authSessions.ts).
- Current behavior: used to hash OTP codes and refresh/session tokens.
- Required status: should be treated as required outside local development.
- Default behavior: falls back to `eyymi-dev-otp-pepper-change-me`.
- Risk: that fallback is unsafe outside local work because it makes hashes predictable across environments.
- Placement: Convex runtime secret env.

### `OTP_DEBUG_LOG_CODES`

- Where used: [`../../convex/authOtp.ts`](../../convex/authOtp.ts).
- Current behavior: enables dev OTP code logging only when explicitly set and when the current deployment is not the hard-coded production deployment.
- Required status: optional.
- Default behavior: disabled.
- Risk: this is a sensitive debug flag and should never be enabled casually outside development.
- Placement: Convex runtime env.
- Production note: the code force-disables OTP debug logging when `CONVEX_DEPLOYMENT` is the production deployment name currently listed in source.

### `TOMTOM_ROUTING_API_KEY`

- Where used: [`../../convex/routes.ts`](../../convex/routes.ts) and as fallback inside [`../../convex/meetingPlaces.ts`](../../convex/meetingPlaces.ts).
- Current behavior: required for `routes.recomputeFastestRoad`; also satisfies search auth when `TOMTOM_SEARCH_API_KEY` is absent.
- Required status: required if route recomputation must work.
- Default behavior: empty string, which leads to runtime errors when route recompute is attempted.
- Placement: Convex runtime secret env.

### `TOMTOM_ROUTING_BASE_URL`

- Where used: [`../../convex/routes.ts`](../../convex/routes.ts).
- Current behavior: builds the TomTom Routing endpoint base URL.
- Required status: optional.
- Default behavior: `https://api.tomtom.com`.
- Placement: Convex runtime env.

### `TOMTOM_SEARCH_API_KEY`

- Where used: [`../../convex/meetingPlaces.ts`](../../convex/meetingPlaces.ts).
- Current behavior: primary credential for meeting-place search.
- Required status: optional only if `TOMTOM_ROUTING_API_KEY` is already present.
- Default behavior: falls back to `TOMTOM_ROUTING_API_KEY`, then empty string.
- Risk: search suggestions throw `TOMTOM_SEARCH_API_KEY is not configured` once both search and routing keys are missing.
- Placement: Convex runtime secret env.

### `TOMTOM_SEARCH_BASE_URL`

- Where used: [`../../convex/meetingPlaces.ts`](../../convex/meetingPlaces.ts).
- Current behavior: builds the TomTom Search endpoint base URL.
- Required status: optional.
- Default behavior: `https://api.tomtom.com`.
- Placement: Convex runtime env.

## Optional Vs Required Summary

| Variable | Recommended stance |
| --- | --- |
| `CONVEX_URL` | Required for real backend setup |
| `CONVEX_DEPLOYMENT` | Required for correct deployment-aware debug behavior |
| `OTP_HASH_PEPPER` | Required outside local development |
| `OTP_DEBUG_LOG_CODES` | Optional and dev-only |
| `TOMTOM_ROUTING_API_KEY` | Required for route recompute |
| `TOMTOM_ROUTING_BASE_URL` | Optional |
| `TOMTOM_SEARCH_API_KEY` | Optional only because it falls back to routing key |
| `TOMTOM_SEARCH_BASE_URL` | Optional |

## Defaults And Risks

- `OTP_HASH_PEPPER` currently has an unsafe dev fallback and should be treated as required outside local development.
- `OTP_DEBUG_LOG_CODES` is intended only for dev and is force-disabled for the production deployment name currently listed in code: `tacit-woodpecker-977`.
- `TOMTOM_SEARCH_API_KEY` falls back to `TOMTOM_ROUTING_API_KEY` if omitted.
- `TOMTOM_ROUTING_BASE_URL` and `TOMTOM_SEARCH_BASE_URL` both default to `https://api.tomtom.com`.
- Missing TomTom API keys do not fail at startup; they fail when search or routing actions are actually invoked.
- `CONVEX_URL` is operationally important even though current Convex source files do not read it directly.

## Related Frontend Coupling Note

- `VITE_CONVEX_URL` belongs to the frontend repo, not this backend repo.
- The frontend value must match the backend deployment the Convex worker is running against.
- If frontend and backend point at different deployments, OTP requests, session state, route cache, and logs will appear inconsistent across repos.
