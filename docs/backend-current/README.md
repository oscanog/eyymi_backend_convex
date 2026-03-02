# Backend Current State

Last verified: **March 2, 2026**

This repository's backend is a **Convex backend**, not a REST API service. The callable surface is the Convex function namespace exposed from `convex/*.ts`, backed by the schema in `convex/schema.ts`, with periodic maintenance handled by `convex/crons.ts`.

## Source Of Truth

- [`../../convex/schema.ts`](../../convex/schema.ts) for tables, fields, and indexes
- Exported functions in [`../../convex`](../../convex) for public and internal backend behavior
- [`../../convex/crons.ts`](../../convex/crons.ts) for scheduled maintenance jobs
- Runtime env reads in:
  - [`../../convex/authOtp.ts`](../../convex/authOtp.ts)
  - [`../../convex/authSessions.ts`](../../convex/authSessions.ts)
  - [`../../convex/meetingPlaces.ts`](../../convex/meetingPlaces.ts)
  - [`../../convex/routes.ts`](../../convex/routes.ts)

## Documents In This Folder

- [`./schema-reference.md`](./schema-reference.md) - Table-by-table schema reference, relationships, statuses, indexes, and cleanup rules
- [`./api-and-functions.md`](./api-and-functions.md) - Public Convex functions, internal functions, cron jobs, and API route reality check
- [`./data-flows.md`](./data-flows.md) - Behavior walkthroughs for presence, auth, sessions, invites, meeting places, routes, soul game, and admin dummy users
- [`./environment.md`](./environment.md) - Backend env reference, deployment alignment, defaults, and risks

## Module Inventory

| Module | Role | Primary files |
| --- | --- | --- |
| `users` | Presence/profile domain keyed by `deviceId` | [`../../convex/users.ts`](../../convex/users.ts) |
| `authOtp` | OTP challenge creation and verification | [`../../convex/authOtp.ts`](../../convex/authOtp.ts) |
| `authSessions` | Session lookup, touch, logout, refresh placeholder | [`../../convex/authSessions.ts`](../../convex/authSessions.ts) |
| `locationSessions` | Share-location session lifecycle | [`../../convex/locationSessions.ts`](../../convex/locationSessions.ts) |
| `sessions` | Compatibility re-export of `locationSessions` | [`../../convex/sessions.ts`](../../convex/sessions.ts) |
| `locations` | Location writes and reads inside sessions | [`../../convex/locations.ts`](../../convex/locations.ts) |
| `meetingPlaces` | Session meeting-place selection and removal flow | [`../../convex/meetingPlaces.ts`](../../convex/meetingPlaces.ts) |
| `routes` | TomTom-backed route snapshot reads and recomputation | [`../../convex/routes.ts`](../../convex/routes.ts) |
| `invites` | Invite lifecycle and invite-created sessions | [`../../convex/invites.ts`](../../convex/invites.ts) |
| `soulGame` | Queue, hold/commit matching, open/close match lifecycle | [`../../convex/soulGame.ts`](../../convex/soulGame.ts), [`../../convex/soulGameLogic.ts`](../../convex/soulGameLogic.ts) |
| `admin` | Dummy-user deployment and Soul Game visibility control | [`../../convex/admin.ts`](../../convex/admin.ts) |
| `health` | Lightweight deployment health check | [`../../convex/health.ts`](../../convex/health.ts) |
| `crons` | Scheduled cleanup and lifecycle sync jobs | [`../../convex/crons.ts`](../../convex/crons.ts) |

## Important Current Realities

- There is **no `convex/http.ts`** in this repo.
- There are **no raw HTTP routes** and no repo-defined `httpAction` endpoints.
- The callable backend API surface is the Convex function namespace, for example `api.users.upsert` and `api.routes.getForSession`.
- [`../../convex/authSessions.ts`](../../convex/authSessions.ts) exports `authSessions.refresh`, but it currently throws `Refresh token rotation is not implemented yet`.
- Phone OTP provider sending is still pending. [`../../convex/authOtp.ts`](../../convex/authOtp.ts) logs either provider-pending information or dev-only OTP codes when the debug flag is allowed.
- `users` and `authUsers` are separate domains with **no direct linking field today**. `users` is app presence/profile state, while `authUsers` is OTP-auth identity state.

## Quick Orientation

- Start with [`./schema-reference.md`](./schema-reference.md) if you need to understand storage.
- Start with [`./api-and-functions.md`](./api-and-functions.md) if you need callable backend behavior.
- Start with [`./data-flows.md`](./data-flows.md) if you need end-to-end operational context.
- Start with [`./environment.md`](./environment.md) if you need deployment setup or env alignment.
