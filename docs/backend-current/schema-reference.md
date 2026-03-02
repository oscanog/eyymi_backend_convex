# Schema Reference

Last verified against [`../../convex/schema.ts`](../../convex/schema.ts) on **March 2, 2026**.

## Relation Overview

The backend currently has three main data domains.

- **Presence and session-sharing domain**: `users`, `locationSessions`, `locations`, `sessionRoutes`, `sessionMeetingPlaces`, and `sessionInvites`.
- **OTP auth domain**: `authUsers`, `phoneOtpChallenges`, and `authSessions`.
- **Soul Game and admin test-data domain**: `soulGameQueue`, `soulGamePressEvents`, `soulGameMatches`, and `adminDummyDeployments`.

Important caveats:

- [`../../convex/sessions.ts`](../../convex/sessions.ts) is only a re-export alias of `locationSessions`.
- `locationSessions` owns cleanup of related location history, route snapshots, and meeting-place rows when a session closes or expires.
- `sessionInvites` can create `locationSessions` when an invite is accepted.
- `sessionRoutes` depends on both active sessions and recent `locations`, and may target a partner location or a meeting place.
- `adminDummyDeployments` also controls mirrored `soulGameQueue` rows.
- `authUsers` and `authSessions` belong to the OTP auth domain.
- `users` is the app presence/profile domain keyed by `deviceId`.
- There is currently no explicit FK bridge between `users` and `authUsers`.

## Enumerations And Status Sets

| Domain | Values |
| --- | --- |
| User gender / match preference | `male`, `female`, `gay`, `lesbian` |
| `locationSessions.status` | `waiting`, `active`, `closed` |
| `sessionRoutes.status` | `pending`, `ready`, `stale`, `error` |
| `sessionRoutes.destinationMode` | `partner`, `meeting_place` |
| Meeting-place status | `set`, `removal_requested` |
| `sessionInvites.status` | `pending`, `accepted`, `declined`, `cancelled`, `expired` |
| `authUsers.status` | `active`, `blocked`, `deleted` |
| OTP purpose | `signin`, `signup`, `reverify` |
| OTP challenge status | `pending`, `verified`, `expired`, `failed`, `consumed` |
| `soulGameQueue.queueStatus` | `queued`, `matching`, `matched` |
| `soulGamePressEvents.status` | `holding`, `ready`, `matched`, `expired`, `cancelled` |
| `soulGameMatches.status` | `success_open`, `closed`, `cancelled` |

## Retention And TTL Summary

| Concern | Current rule |
| --- | --- |
| Waiting location-session TTL | 5 minutes |
| Active location-session TTL | 24 hours |
| Closed-session hard cleanup delay | 15 seconds after close |
| Location history cleanup window | 1 hour |
| Invite TTL | 2 minutes |
| Meeting-place removal request TTL | 5 minutes |
| OTP expiry | 5 minutes |
| OTP max attempts | 5 |
| OTP resend cooldown | 30 seconds |
| Auth session TTL | 30 days |
| Route snapshot TTL | 45 seconds |
| Route fallback grace | 90 seconds |
| Route recompute lock TTL | 12 seconds |
| Route error retry window | 8 seconds |
| Soul Game queue stale threshold | 45 seconds without heartbeat |
| Soul Game heartbeat target | 15 seconds |
| Soul Game minimum hold | 1.5 seconds |
| Soul Game focus window | 3 seconds |
| Admin dummy deployment duration | 10 minutes |
| Online user freshness window | 2 minutes |
| Inactive user cleanup threshold | 5 minutes |

## `users`

Purpose: app-level presence and lightweight profile storage keyed by `deviceId`.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/users.ts`](../../convex/users.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `deviceId` | `string` | Yes | Client/device identity used by the current app presence model |
| `username` | `string` | Yes | Display username |
| `usernameKey` | `string` | No | Lowercased normalized username for conflict checks |
| `gender` | enum | No | User gender |
| `preferredMatchGender` | enum | No | Match preference |
| `avatarId` | `string` | No | Avatar identifier |
| `isOnline` | `boolean` | Yes | Last known online flag |
| `lastSeen` | `number` | Yes | Last heartbeat timestamp in ms |
| `isAdminDummy` | `boolean` | No | Marks admin-generated dummy users |
| `dummySlot` | `number` | No | Stable dummy slot number |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_device` | `deviceId` | Resolve current app user by device |
| `by_usernameKey` | `usernameKey` | Detect active username conflicts |
| `by_lastSeen` | `lastSeen` | Mark stale users offline and cleanup inactive users |

### Relationships

- Outbound: referenced by `locationSessions.user1Id`, `locationSessions.user2Id`, `locations.userId`, `sessionMeetingPlaces.setByUserId`, `sessionMeetingPlaces.removalRequestedBy`, `sessionInvites.requesterId`, `sessionInvites.recipientId`, `sessionRoutes.routeOwnerUserId`, `soulGameQueue.profileUserId`, `soulGameQueue.linkedUserId`, and `adminDummyDeployments.userIds`.
- Inbound behavior: `admin.ts` may create or refresh dummy `users` rows.

### Lifecycle / retention

- Presence is refreshed by `users.upsert` and `users.heartbeat`.
- Users not seen for 2 minutes may be marked offline by `users.markStaleOffline`.
- Users inactive for 5 minutes may be deleted by `users.cleanupInactiveUsers` if they are not tied to active sessions or pending invites.

### Writers / readers

- Writes: `users.upsert`, `users.heartbeat`, `users.setOffline`, `users.updateMatchPreference`, `admin.deployDummyUsers`, `admin.syncDummyUsersLifecycle`.
- Reads: most session/invite/meeting-place/admin flows and `users.get*`.

## `adminDummyDeployments`

Purpose: stores the single active admin dummy-user deployment configuration.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/admin.ts`](../../convex/admin.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `key` | `string` | Yes | Deployment key, currently `global` |
| `userIds` | `Id<"users">[]` | Yes | Dummy users managed by the deployment |
| `startedAt` | `number` | Yes | Deployment start timestamp |
| `expiresAt` | `number` | Yes | Deployment expiry timestamp |
| `updatedAt` | `number` | Yes | Last deployment mutation time |
| `soulGameVisibilityEnabled` | `boolean` | No | Whether dummies should appear in Soul Game |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_key` | `key` | Read the singleton deployment record |

### Relationships

- Outbound: points at `users` via `userIds`.
- Behavioral coupling: drives mirrored `soulGameQueue` rows for each dummy user.

### Lifecycle / retention

- Dummy deployments last 10 minutes.
- A cron calls `admin.syncDummyUsersLifecycle` every minute to keep both dummy `users` rows and mirrored `soulGameQueue` rows aligned with the deployment state.

### Writers / readers

- Writes: `admin.deployDummyUsers`, `admin.setSoulGameDummyVisibility`.
- Reads: `admin.getDummyUsersStatus`, `admin.syncDummyUsersLifecycle`, `users.getOnlineUsers`, `soulGame.getClientState`.

## `locationSessions`

Purpose: session-level record for two-user location sharing and related meeting-place/route state.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/locationSessions.ts`](../../convex/locationSessions.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `code` | `string` | Yes | 6-character share/join code |
| `user1Id` | `Id<"users">` | Yes | Host participant |
| `user2Id` | `Id<"users">` | No | Guest participant once joined |
| `status` | enum | Yes | `waiting`, `active`, or `closed` |
| `createdAt` | `number` | Yes | Creation timestamp |
| `expiresAt` | `number` | Yes | Session expiry timestamp |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_code` | `code` | Join by session code |
| `by_user1` | `user1Id` | Find host sessions |
| `by_user2` | `user2Id` | Find guest sessions |
| `by_status_createdAt` | `status`, `createdAt` | Cleanup stale waiting sessions |
| `by_expiresAt` | `expiresAt` | Cleanup expired sessions |

### Relationships

- Outbound: references `users` via `user1Id` and `user2Id`.
- Inbound: referenced by `locations.sessionId`, `sessionRoutes.sessionId`, `sessionMeetingPlaces.sessionId`, and optionally `sessionInvites.sessionId`.

### Lifecycle / retention

- Created in `waiting` state with 5-minute TTL by `locationSessions.create`.
- Becomes `active` with 24-hour TTL when `locationSessions.join` succeeds.
- Invite acceptance in `invites.respond` can create an already-`active` session directly.
- `locationSessions.close` marks it closed and schedules hard cleanup 15 seconds later.
- `cleanupWaitingSession`, `cleanupStaleWaitingSessions`, and `cleanupExpired` all delete dependent `locations`, `sessionRoutes`, and `sessionMeetingPlaces`.

### Writers / readers

- Writes: `locationSessions.create`, `locationSessions.join`, `locationSessions.close`, `invites.respond`, internal cleanup mutations.
- Reads: location, meeting-place, route, invite, and admin/user cleanup logic.

## `locations`

Purpose: append-only location history rows inside a location-sharing session.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/locations.ts`](../../convex/locations.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sessionId` | `Id<"locationSessions">` | Yes | Owning session |
| `userId` | `Id<"users">` | Yes | User who sent the location |
| `lat` | `number` | Yes | Latitude |
| `lng` | `number` | Yes | Longitude |
| `accuracy` | `number` | No | Client-reported accuracy |
| `timestamp` | `number` | Yes | Write time in ms |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_session_time` | `sessionId`, `timestamp` | Query latest or recent session locations |
| `by_user` | `userId` | Query latest location for one participant |

### Relationships

- Outbound: references `locationSessions` and `users`.
- Inbound: read by `routes` to compute route context.

### Lifecycle / retention

- Written by `locations.update`.
- Deleted as part of session cleanup by `locationSessions` internal cleanup mutations.
- Also pruned by `locations.cleanupOld`, which removes rows older than 1 hour.

### Writers / readers

- Writes: `locations.update`.
- Reads: `locations.get*`, `routes.getRecomputeContext`, `routes.recomputeFastestRoad`.

## `sessionRoutes`

Purpose: cached TomTom route snapshots for either partner-to-partner routing or participant-to-meeting-place routing.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/routes.ts`](../../convex/routes.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sessionId` | `Id<"locationSessions">` | Yes | Owning session |
| `routeKey` | `string` | No | Stable route identity, default pair route or meeting route key |
| `routeOwnerUserId` | `Id<"users">` | No | Participant the route belongs to for meeting-place mode |
| `destinationMode` | enum | No | `partner` or `meeting_place` |
| `destinationPlaceId` | `string` | No | Provider place key or coordinate fallback |
| `provider` | literal | Yes | Currently always `tomtom` |
| `status` | enum | Yes | `pending`, `ready`, `stale`, or `error` |
| `polyline` | `{lat,lng}[]` | No | Route geometry |
| `distanceMeters` | `number` | No | Route length |
| `durationSeconds` | `number` | No | Non-traffic or derived duration |
| `trafficDurationSeconds` | `number` | No | Traffic-aware duration |
| `computedAt` | `number` | Yes | Snapshot compute time |
| `expiresAt` | `number` | Yes | Freshness / retry expiration |
| `origin` | object | Yes | Normalized route origin |
| `destination` | object | Yes | Normalized route destination |
| `geometryHash` | `string` | No | Reduced geometry fingerprint used for replacement gating |
| `lastError` | `string` | No | Last recompute error message |
| `errorAt` | `number` | No | Last error timestamp |
| `lockToken` | `string` | No | Recompute lock token |
| `lockExpiresAt` | `number` | No | Recompute lock expiry |
| `lastRequestedAt` | `number` | No | Last recompute attempt time |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_session_routeKey` | `sessionId`, `routeKey` | Read the latest snapshot for a route key |
| `by_sessionId` | `sessionId` | Load all route rows for a session |
| `by_expiresAt` | `expiresAt` | Cleanup expired snapshots |

### Relationships

- Outbound: references `locationSessions`, optionally `users`, and indirectly a meeting place via `destinationPlaceId`.
- Inputs come from recent `locations` rows and optional `sessionMeetingPlaces` rows.

### Lifecycle / retention

- Recomputed by `routes.recomputeFastestRoad`.
- Fresh route TTL is 45 seconds.
- On provider failure, recent snapshots can remain as `stale` for a 90-second fallback grace.
- Locks last 12 seconds to avoid duplicate recomputes.
- Error snapshots get an 8-second retry window.
- Session cleanup removes these rows. A cron also deletes expired snapshots if they are not still locked.

### Writers / readers

- Writes: `routes.acquireRecomputeLock`, `routes.upsertRouteSnapshot`, `routes.releaseRecomputeLock`, `routes.cleanupExpiredRouteSnapshots`.
- Reads: `routes.getForSession`, `routes.getForSessionRoutes`, `routes.getRecomputeContext`.

## `sessionMeetingPlaces`

Purpose: current meeting-place selection for a location session, including temporary removal-request state.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/meetingPlaces.ts`](../../convex/meetingPlaces.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sessionId` | `Id<"locationSessions">` | Yes | Owning session |
| `status` | enum | Yes | `set` or `removal_requested` |
| `place` | object | Yes | Selected place payload |
| `setByUserId` | `Id<"users">` | Yes | User who last set the place |
| `removalRequestedBy` | `Id<"users">` | No | User requesting removal |
| `createdAt` | `number` | Yes | Initial set time |
| `updatedAt` | `number` | Yes | Last modification time |
| `removalRequestExpiresAt` | `number` | No | Removal request expiry |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_sessionId` | `sessionId` | Load session meeting place |
| `by_removalRequestExpiresAt` | `removalRequestExpiresAt` | Reset expired removal requests |

### Relationships

- Outbound: references `locationSessions`, `users`, and may carry provider place IDs used by `sessionRoutes`.

### Lifecycle / retention

- Set or replaced by `meetingPlaces.setMeetingPlace`.
- Removal requests last 5 minutes.
- `meetingPlaces.cleanupExpiredRemovalRequests` resets expired `removal_requested` rows back to `set`.
- Session cleanup removes the row entirely.

### Writers / readers

- Writes: `meetingPlaces.setMeetingPlace`, `meetingPlaces.requestRemoval`, `meetingPlaces.respondRemoval`, `meetingPlaces.cleanupExpiredRemovalRequests`.
- Reads: `meetingPlaces.getForSession`, route queries and recompute logic.

## `sessionInvites`

Purpose: invite state between two users before a shared session exists or while one is being created.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/invites.ts`](../../convex/invites.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `requesterId` | `Id<"users">` | Yes | Sender |
| `recipientId` | `Id<"users">` | Yes | Receiver |
| `pairKey` | `string` | Yes | Sorted pair identity for dedupe |
| `status` | enum | Yes | `pending`, `accepted`, `declined`, `cancelled`, or `expired` |
| `sessionId` | `Id<"locationSessions">` | No | Active session created from an accepted invite |
| `createdAt` | `number` | Yes | Invite creation time |
| `updatedAt` | `number` | Yes | Last invite state change |
| `expiresAt` | `number` | Yes | Invite expiry |
| `respondedAt` | `number` | No | Final response time |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_requester` | `requesterId` | Outgoing invite lookup |
| `by_recipient` | `recipientId` | Incoming invite lookup |
| `by_pair_status` | `pairKey`, `status` | Pending dedupe by pair |
| `by_expiresAt` | `expiresAt` | Expire pending invites |

### Relationships

- Outbound: references `users` and optionally `locationSessions`.
- Behavioral role: accepted invites may create a new active `locationSessions` row.

### Lifecycle / retention

- Pending invites expire after 2 minutes.
- `invites.respond` can mark an invite `accepted`, `declined`, `cancelled`, or `expired`.
- `invites.expirePending` exists as an internal cleanup path, but there is currently no cron wired to it in `convex/crons.ts`.

### Writers / readers

- Writes: `invites.send`, `invites.respond`, `invites.cancel`, `invites.expirePending`.
- Reads: `invites.getIncomingPendingForUser`, `invites.getLatestOutgoingForUser`, `users.cleanupInactiveUsers`.

## `authUsers`

Purpose: OTP-auth identity records keyed by verified phone number.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/authOtp.ts`](../../convex/authOtp.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `phoneE164` | `string` | Yes | Normalized phone number |
| `phoneVerifiedAt` | `number` | Yes | Last successful verification time |
| `status` | enum | Yes | `active`, `blocked`, or `deleted` |
| `createdAt` | `number` | Yes | Identity creation time |
| `updatedAt` | `number` | Yes | Last identity update |
| `lastLoginAt` | `number` | No | Last successful sign-in time |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_phoneE164` | `phoneE164` | Find account for sign-in/signup checks |
| `by_status` | `status` | Filter by auth-user state |

### Relationships

- Inbound: referenced by `authSessions.authUserId`.
- Caveat: there is no direct link to app `users`.

### Lifecycle / retention

- Created or reactivated during `authOtp.verifyCode`.
- `deleted` accounts may currently be reactivated through signup verification.

### Writers / readers

- Writes: `authOtp.verifyCode`.
- Reads: `authOtp.requestCode`, `authOtp.verifyCode`, `authSessions.getCurrent`.

## `phoneOtpChallenges`

Purpose: challenge rows for OTP issuance and verification attempts.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/authOtp.ts`](../../convex/authOtp.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `phoneE164` | `string` | Yes | Normalized phone number |
| `otpCodeHash` | `string` | Yes | Hashed OTP code with pepper |
| `purpose` | enum | Yes | `signin`, `signup`, or `reverify` |
| `status` | enum | Yes | `pending`, `verified`, `expired`, `failed`, or `consumed` |
| `attemptCount` | `number` | Yes | Verification attempts used |
| `maxAttempts` | `number` | Yes | Attempt ceiling, currently 5 |
| `resendCount` | `number` | Yes | Request resend counter |
| `expiresAt` | `number` | Yes | Challenge expiry |
| `verifiedAt` | `number` | No | Verification time |
| `consumedAt` | `number` | No | Consumption time |
| `providerMessageId` | `string` | No | Placeholder for SMS provider integration |
| `ipAddress` | `string` | No | Request IP |
| `deviceId` | `string` | No | Requesting device ID |
| `createdAt` | `number` | Yes | Creation time |
| `updatedAt` | `number` | Yes | Last update time |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_phone_createdAt` | `phoneE164`, `createdAt` | Get latest challenge per phone |
| `by_status` | `status` | Filter challenges by state |
| `by_expiresAt` | `expiresAt` | Expiry-based reads if needed |

### Relationships

- Logical outbound relation to `authUsers` by `phoneE164`, not by FK.

### Lifecycle / retention

- New OTP challenges expire after 5 minutes.
- Requests are rate-limited by a 30-second resend cooldown based on the latest challenge.
- Failed attempts increment `attemptCount`; at 5 attempts status becomes `failed`.
- Successful verification consumes the challenge and creates an `authSessions` row.

### Writers / readers

- Writes: `authOtp.requestCode`, `authOtp.verifyCode`.
- Reads: `authOtp.requestCode`, `authOtp.verifyCode`.

## `authSessions`

Purpose: refresh-token-backed session store for OTP-authenticated users.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/authOtp.ts`](../../convex/authOtp.ts), [`../../convex/authSessions.ts`](../../convex/authSessions.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `authUserId` | `Id<"authUsers">` | Yes | Session owner |
| `refreshTokenHash` | `string` | Yes | Hashed raw session token |
| `deviceId` | `string` | No | Device identifier |
| `platform` | `string` | No | Platform label |
| `appVersion` | `string` | No | App version |
| `ipAddress` | `string` | No | Request IP |
| `userAgent` | `string` | No | Client UA |
| `createdAt` | `number` | Yes | Session creation time |
| `lastSeenAt` | `number` | No | Last touch time |
| `expiresAt` | `number` | Yes | Session expiry |
| `revokedAt` | `number` | No | Logout/revocation time |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_authUserId` | `authUserId` | Query sessions per auth user |
| `by_refreshTokenHash` | `refreshTokenHash` | Resolve session from raw token |
| `by_expiresAt` | `expiresAt` | Expiry-based maintenance |
| `by_revokedAt` | `revokedAt` | Revocation filtering |

### Relationships

- Outbound: references `authUsers`.

### Lifecycle / retention

- Created in `authOtp.verifyCode`.
- Session TTL is 30 days.
- `authSessions.touch` updates `lastSeenAt`.
- `authSessions.logout` sets `revokedAt`.
- `authSessions.refresh` is exported but currently unimplemented.

### Writers / readers

- Writes: `authOtp.verifyCode`, `authSessions.touch`, `authSessions.logout`.
- Reads: `authSessions.getCurrent`, `authSessions.touch`, `authSessions.logout`.

## `soulGameQueue`

Purpose: active Soul Game participant rows, including normal users and admin-mirrored dummy rows.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/soulGame.ts`](../../convex/soulGame.ts), [`../../convex/admin.ts`](../../convex/admin.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `participantKey` | `string` | Yes | Stable queue identity derived from scope and profile/user identity |
| `scopeKey` | `string` | No | Matching scope |
| `profileUserId` | `Id<"users">` | No | Linked app user |
| `linkedUserId` | `Id<"users">` | No | Used by admin dummy mirrored rows |
| `isAdminDummy` | `boolean` | No | Marks dummy mirrored rows |
| `dummySlot` | `number` | No | Dummy slot number |
| `username` | `string` | No | Display username snapshot |
| `avatarId` | `string` | No | Avatar snapshot |
| `gender` | enum | No | Gender snapshot |
| `preferredMatchGender` | enum | No | Match preference snapshot |
| `isActive` | `boolean` | Yes | Whether queue entry is live |
| `queueStatus` | enum | Yes | `queued`, `matching`, or `matched` |
| `targetQueueEntryId` | `Id<"soulGameQueue">` | No | Current focus target |
| `activeMatchId` | `Id<"soulGameMatches">` | No | Open match if any |
| `joinedAt` | `number` | Yes | Queue join time |
| `lastHeartbeatAt` | `number` | Yes | Last activity heartbeat |
| `lastPressAt` | `number` | No | Last successful hold/press timestamp |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_participantKey` | `participantKey` | Idempotent joinQueue behavior |
| `by_isActive_lastHeartbeatAt` | `isActive`, `lastHeartbeatAt` | Load active queue rows and clean stale ones |
| `by_activeMatchId` | `activeMatchId` | Find current match membership |
| `by_linkedUserId` | `linkedUserId` | Manage dummy mirror rows |
| `by_isAdminDummy_lastHeartbeatAt` | `isAdminDummy`, `lastHeartbeatAt` | Sync dummy mirrored rows |

### Relationships

- Outbound: may reference `users` and `soulGameMatches`.
- Inbound: referenced by `soulGamePressEvents.queueEntryId`, `soulGamePressEvents.targetQueueEntryId`, `soulGameMatches.userAQueueEntryId`, and `soulGameMatches.userBQueueEntryId`.

### Lifecycle / retention

- Created or refreshed by `soulGame.joinQueue`.
- Heartbeats keep rows active every 15 seconds; stale threshold is 45 seconds.
- `soulGame.cleanupLifecycle` marks stale entries inactive.
- `admin.syncDummyUsersLifecycle` also mutates dummy mirror rows.

### Writers / readers

- Writes: `soulGame.joinQueue`, `soulGame.heartbeat`, `soulGame.leaveQueue`, `soulGame.pressStart`, `soulGame.pressCommit`, `soulGame.closeMatch`, `soulGame.cleanupLifecycle`, admin sync functions.
- Reads: all Soul Game queries and matching logic.

## `soulGamePressEvents`

Purpose: hold/commit interaction records inside Soul Game focus windows.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/soulGame.ts`](../../convex/soulGame.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `queueEntryId` | `Id<"soulGameQueue">` | Yes | Press owner |
| `participantKey` | `string` | No | Snapshot identity |
| `scopeKey` | `string` | No | Matching scope |
| `targetQueueEntryId` | `Id<"soulGameQueue">` | Yes | Intended target |
| `focusWindowId` | `string` | No | Matching window identifier |
| `pressStartedAt` | `number` | Yes | Hold start time |
| `readyAt` | `number` | No | Time minimum hold was satisfied |
| `pressEndedAt` | `number` | No | Hold/cancel/expire end time |
| `durationMs` | `number` | No | Effective hold duration |
| `status` | enum | Yes | `holding`, `ready`, `matched`, `expired`, `cancelled` |
| `matchId` | `Id<"soulGameMatches">` | No | Match created from the reciprocal ready event |
| `createdAt` | `number` | Yes | Row creation time |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_queueEntry_status` | `queueEntryId`, `status` | Load current press state for a participant |
| `by_status_startedAt` | `status`, `pressStartedAt` | Cleanup expired holding/ready rows |
| `by_target_status` | `targetQueueEntryId`, `status` | Find reciprocal holds and ready presses |
| `by_matchId` | `matchId` | Trace matched press rows |

### Relationships

- Outbound: references `soulGameQueue` and optionally `soulGameMatches`.

### Lifecycle / retention

- Created by `soulGame.pressStart`.
- Updated by `pressCommit`, `pressCancel`, match creation, and lifecycle cleanup.
- Expires when its focus window ends or it goes stale beyond queue thresholds.

### Writers / readers

- Writes: `soulGame.pressStart`, `soulGame.pressCommit`, `soulGame.pressCancel`, `soulGame.leaveQueue`, `soulGame.cleanupLifecycle`.
- Reads: Soul Game query/matching helpers.

## `soulGameMatches`

Purpose: open or historical pair matches produced by reciprocal Soul Game ready presses.

Source: [`../../convex/schema.ts`](../../convex/schema.ts), [`../../convex/soulGame.ts`](../../convex/soulGame.ts)

### Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `scopeKey` | `string` | No | Match scope |
| `userAQueueEntryId` | `Id<"soulGameQueue">` | Yes | First participant |
| `userBQueueEntryId` | `Id<"soulGameQueue">` | Yes | Second participant |
| `userAPressEventId` | `Id<"soulGamePressEvents">` | Yes | First participant's ready press |
| `userBPressEventId` | `Id<"soulGamePressEvents">` | Yes | Second participant's ready press |
| `userAProgressStartAt` | `number` | Yes | Hold start time for A |
| `userBProgressStartAt` | `number` | Yes | Hold start time for B |
| `progressDurationMs` | `number` | Yes | Minimum hold duration used |
| `matchWindowStart` | `number` | Yes | Focus-window start |
| `matchWindowEnd` | `number` | Yes | Focus-window end |
| `overlapMs` | `number` | Yes | Time overlap between reciprocal holds |
| `status` | enum | Yes | `success_open`, `closed`, `cancelled` |
| `createdAt` | `number` | Yes | Match creation time |
| `readyAt` | `number` | No | Time match became ready |
| `windowId` | `string` | No | Focus-window identifier |

### Indexes

| Index | Fields | Why it exists |
| --- | --- | --- |
| `by_status_createdAt` | `status`, `createdAt` | Query matches by state over time |
| `by_userAQueueEntryId` | `userAQueueEntryId` | Find matches by participant |
| `by_userBQueueEntryId` | `userBQueueEntryId` | Find matches by participant |

### Relationships

- Outbound: references `soulGameQueue` and `soulGamePressEvents`.

### Lifecycle / retention

- Created by `soulGame.pressCommit` when reciprocal ready presses line up.
- Closed by `soulGame.closeMatch`.
- Open matches are also reflected back onto queue rows and press-event rows.

### Writers / readers

- Writes: `soulGame.pressCommit`, `soulGame.closeMatch`.
- Reads: `soulGame.getClientState`, internal matching helpers.
