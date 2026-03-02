# Data Flows

Last verified against current logic in [`../../convex`](../../convex) on **March 2, 2026**.

## Presence / Profile Flow

Source: [`../../convex/users.ts`](../../convex/users.ts)

- App launch calls `users.upsert` with `deviceId` and username/profile inputs.
- The backend normalizes `usernameKey`, validates minimum length, and checks whether another **active** user currently holds that username.
- If the same `deviceId` already exists, the row is patched in place and marked online.
- If the username is actively in use by someone else, the mutation throws a structured `USERNAME_IN_USE` error with a suggestion.
- While the app remains active, `users.heartbeat` refreshes `isOnline` and `lastSeen`.
- When the app backgrounds or exits, `users.setOffline` flips the row offline.
- Every minute, `users.markStaleOffline` turns old online rows offline if they have not been seen for 2 minutes.
- Every minute, `users.cleanupInactiveUsers` deletes old user rows after 5 minutes if they are not tied to active location sessions or pending invites.

## OTP Auth Flow

Source: [`../../convex/authOtp.ts`](../../convex/authOtp.ts), [`../../convex/authSessions.ts`](../../convex/authSessions.ts)

- Client calls `authOtp.requestCode` with a raw phone number and purpose.
- The backend normalizes the phone into E.164, checks account state in `authUsers`, enforces the 30-second resend cooldown, hashes a new 6-digit code, and inserts `phoneOtpChallenges`.
- If OTP debug logging is enabled in a non-production deployment, the code is printed to logs. Otherwise the backend logs that provider integration is still pending.
- Client calls `authOtp.verifyCode` with `challengeId` and the 6-digit code.
- The backend rejects expired, non-pending, malformed, or over-attempted challenges.
- On success, the backend creates or updates an `authUsers` row, inserts an `authSessions` row, marks the challenge `consumed`, and returns the raw session token.
- Client can later call `authSessions.getCurrent` to resolve session + auth-user state.
- `authSessions.touch` updates `lastSeenAt`.
- `authSessions.logout` sets `revokedAt`.
- `authSessions.refresh` exists but does not rotate refresh tokens yet; it currently always throws.

## Location Session Flow

Source: [`../../convex/locationSessions.ts`](../../convex/locationSessions.ts), [`../../convex/locations.ts`](../../convex/locations.ts)

- Host creates a session through `locationSessions.create`.
- The backend generates a 6-character code, inserts a `waiting` `locationSessions` row, sets a 5-minute expiry, and schedules `cleanupWaitingSession`.
- Guest joins through `locationSessions.join` using the code.
- If the code is valid and the session is still open, `user2Id` is set, status changes to `active`, and expiry extends to 24 hours.
- Session participants send live positions through `locations.update`.
- Host may send while the session is still `waiting`; guest cannot send until the session is `active`.
- Either participant can call `locationSessions.close`, which marks the session `closed` and schedules hard cleanup 15 seconds later.
- Internal cleanup mutations delete the session and dependent `locations`, `sessionRoutes`, and `sessionMeetingPlaces`.
- Cron jobs provide backup cleanup for stale waiting sessions and any fully expired sessions.

## Invite Flow

Source: [`../../convex/invites.ts`](../../convex/invites.ts)

- `invites.send` checks that requester and recipient both exist and are not already tied to active sessions.
- The backend deduplicates by `pairKey` and only allows one live pending invite for a pair.
- A pending invite lives for 2 minutes.
- Recipient calls `invites.respond`.
- If `accept` is `false`, the invite becomes `declined`.
- If the invite has already expired, it becomes `expired`.
- If `accept` is `true` and both users are still free, the backend creates an **active** `locationSessions` row immediately and patches the invite to `accepted`.
- Requester can cancel a pending invite through `invites.cancel`.
- `invites.expirePending` exists as an internal expiration helper, but it is not currently scheduled from `convex/crons.ts`.

## Meeting-Place And Route Flow

Source: [`../../convex/meetingPlaces.ts`](../../convex/meetingPlaces.ts), [`../../convex/routes.ts`](../../convex/routes.ts)

- A session participant sets a meeting place through `meetingPlaces.setMeetingPlace`.
- The backend upserts one `sessionMeetingPlaces` row per session and clears any previous removal request state.
- Another participant can propose deletion through `meetingPlaces.requestRemoval`.
- That request moves the row to `removal_requested` for 5 minutes.
- The other participant resolves it through `meetingPlaces.respondRemoval`.
- Accept deletes the meeting-place row. Reject resets the row back to `set`.
- A cron resets expired removal requests back to `set`.
- `meetingPlaces.searchSuggestions` is a Convex action that queries TomTom Search and returns normalized place suggestions.
- `routes.getForSession` and `routes.getForSessionRoutes` read cached route snapshots from `sessionRoutes`.
- Without a meeting place, there is one pair route keyed as the default pair route.
- With a meeting place, there is one route per participant keyed by meeting place and route owner.
- `routes.recomputeFastestRoad` loads context, verifies the session is active and the caller is a participant, and checks that the latest locations are still fresh.
- The action acquires a route-specific lock, calls TomTom Routing, and writes a `ready` snapshot on success.
- Recompute is gated by freshness, movement thresholds, and minimum recompute interval.
- Replacement is also gated by geometry and ETA hysteresis so tiny changes do not churn the cache.
- If TomTom fails but a recent good route still exists, the backend stores a `stale` snapshot and keeps serving the fallback briefly.
- If no usable fallback exists, the backend stores an `error` snapshot.

## Soul Game Flow

Source: [`../../convex/soulGame.ts`](../../convex/soulGame.ts), [`../../convex/soulGameLogic.ts`](../../convex/soulGameLogic.ts)

- A participant enters Soul Game through `soulGame.joinQueue`.
- The backend creates or refreshes a `soulGameQueue` row identified by `participantKey`.
- Queue state is scoped by optional `scopeKey`.
- The matching UI uses `soulGame.getClientState`, which returns current config, candidate list, focus window, focus target, hold progress, and any open match.
- Focus windows are 3 seconds long.
- A hold must reach 1.5 seconds to become ready.
- `soulGame.pressStart` only succeeds if the caller targets the **current** focus target in the active focus window.
- Starting a press creates or reuses a `soulGamePressEvents` row and moves the queue row into `matching`.
- `soulGame.pressCommit` marks the press ready once the minimum hold is met.
- If the target participant has also reached a reciprocal ready state in the same window, the backend creates a `soulGameMatches` row and patches both queue rows to `matched`.
- `soulGame.pressCancel` cancels only a still-holding press. Ready or matched presses are preserved.
- `soulGame.closeMatch` closes an open match and clears both participants back to queued state.
- `soulGame.leaveQueue` deactivates the queue row and cancels active holding/ready press events.
- Every minute, `soulGame.cleanupLifecycle` marks stale queue rows inactive and expires old holding/ready press events whose windows ended or whose rows went stale.

## Admin Dummy Flow

Source: [`../../convex/admin.ts`](../../convex/admin.ts)

- `admin.deployDummyUsers` creates or refreshes 40 deterministic dummy `users` rows.
- Each dummy gets a stable device ID, username, gender bucket, avatar slot, and `dummySlot`.
- The backend writes or updates the singleton `adminDummyDeployments` row with a 10-minute expiry.
- The same flow mirrors those users into `soulGameQueue` so they can appear in Soul Game.
- `admin.setSoulGameDummyVisibility` toggles whether mirrored dummy queue rows should stay active.
- `users.getOnlineUsers` only exposes dummy users when the deployment is still active and the user belongs to the current deployment.
- `soulGame.getClientState` hides or shows dummy queue rows based on the deployment visibility flag.
- Every minute, `admin.syncDummyUsersLifecycle` refreshes dummy user presence and keeps mirrored queue rows aligned with deployment expiry and visibility.
