# Mobile App Build Blueprint (Cross-Platform iOS + Android)

Purpose: Complete plan to build a social discovery app with anonymous timed chat, matching, voice interaction, moments feed, avatar customization, and optional virtual gifting.

Status: Blueprint (MVP -> v1 -> scale)

## 0) Tailoring Questions (Minimum Set)

Answer these to refine the plan. If not answered, defaults below apply.

1. Launch region and languages?
2. Friendship-first vs dating-first positioning?
3. Phone auth required at MVP?
4. Anonymous timed chat required at MVP?
5. Voice features depth at MVP (1:1 only vs rooms)?
6. In-app purchases/gifts in MVP or post-MVP?
7. Team size and in-house skill strengths?
8. Target MVP launch date and budget range?

## Assumptions (Used Throughout)

- Audience is 18+ (no minors in MVP).
- Initial markets: SEA + LATAM, English + 1 local language in v1.
- MVP focuses on connection quality, safety, and low-friction onboarding.
- Monetization starts post-MVP (virtual goods, premium boosts).
- Single cross-platform mobile codebase is required.
- Backend is custom (not no-code), production-ready, with analytics and moderation support.
- Compliance baseline includes privacy policy, account deletion, and regional consent flows.

---

## 1) Product & Strategy

### 1.1 App One-Liner

`A mobile social discovery app that helps young adults meet new people through timed anonymous conversations, voice interactions, and community moments before deeper profile-based matching.`

### 1.2 Problem Statement

Current social and dating apps often over-index on appearance and create high-pressure interactions. Users want:

- Lower-pressure ways to start conversations
- Safer ways to meet strangers
- More personality-first discovery
- Casual social discovery (not only dating)
- Faster conversation starts without profile perfection

### 1.3 Target Users / Personas

#### Persona A: "Curious Connector" (18-24)

- Goal: Meet new people casually after school/work
- Pain points: Awkward intros, ghosting, superficial matching
- Behaviors: Heavy mobile use, chats in short bursts, prefers fast features
- Success signal: Starts 2+ new conversations/week

#### Persona B: "Voice-First Socializer" (19-27)

- Goal: Connect through voice, not just text/photos
- Pain points: Text feels dry; wants chemistry quickly
- Behaviors: Uses earbuds, joins at night, likes audio rooms/calls
- Success signal: Participates in voice features 3x/week

#### Persona C: "Community Lurker to Contributor" (18-25)

- Goal: Browse posts, react, and slowly engage
- Pain points: Fear of posting publicly
- Behaviors: Watches, reacts, then posts occasionally
- Success signal: Converts from viewer to poster within 14 days

#### Persona D: "Safety-Conscious New User" (18-30)

- Goal: Try social discovery without risk
- Pain points: Harassment, scams, fake accounts
- Behaviors: Reads policies, blocks fast, values controls
- Success signal: Completes onboarding and returns within 7 days

### 1.4 Core User Journeys (MVP)

#### Journey 1: Anonymous Timed Chat -> Match -> Direct Chat

1. Install app
2. Sign up
3. Complete basic profile
4. Enter timed chat queue
5. Start anonymous 3-minute chat
6. Decide to reveal profile / continue
7. Mutual interest -> match created
8. Move to direct chat
9. Receive reminders / re-engagement notification

#### Journey 2: Swipe Discovery -> Chat

1. Complete profile + preferences
2. Browse discovery cards
3. Like/pass users
4. Mutual like triggers match
5. Start text chat
6. Optional voice call invite

#### Journey 3: Moments Feed -> Profile Visit -> Connect

1. Browse community feed
2. React/comment on a moment
3. Visit profile
4. Send connect request / like
5. Start conversation if accepted / matched

### 1.5 Competitive Analysis Checklist + Differentiation Strategy

#### Competitive Checklist (Use for 5-10 competitors)

- Onboarding friction (steps to first chat)
- Verification methods (phone, email, selfie, ID optional)
- Discovery modes (swipe, feed, audio, prompts)
- Matching mechanics (mutual like, time-boxed, blind chat)
- Conversation starters and anti-ghosting tools
- Safety controls (report, block, filters, moderation response speed)
- Creator/community features (posts, comments, groups)
- Voice/video support and reliability
- Monetization (subscriptions, boosts, gifts)
- Regionalization/localization quality
- App performance on low-end Android devices
- Retention hooks (streaks, quests, reminders)

#### Differentiation Strategy (Recommended)

- Lead with personality-first, timed anonymous conversations
- Friendship-first positioning at launch (reduces app-store review risk vs explicit dating claims)
- Safety-forward defaults (blur media, easy block/report, consent prompts)
- Voice as a progression step, not first step (improves trust)
- Moments feed as identity-building layer after match features
- Lightweight gamification (daily tokens, streaks) without pay-to-win early

### 1.6 MVP Definition Rules (Must / Should / Could)

#### Must (MVP)

- Can sign up/login securely
- Can create/edit profile and avatar basics
- Can enter anonymous timed chat and exchange messages
- Can discover users and express interest
- Can match and direct chat
- Can browse/post moments (light version)
- Can report/block users
- Can receive push notifications
- Analytics/crash reporting available

#### Should (MVP+ if time permits)

- Voice notes or simple 1:1 voice calling
- Profile prompts / icebreakers
- Basic verification badge (phone/email)
- Remote config and feature flags
- In-app moderation queue for admins

#### Could (Post-MVP)

- Group voice rooms
- Virtual gifts and IAP
- Avatar shop
- Premium subscription / boosts
- Recommendation ML ranking
- Video chat

### 1.7 Success Metrics

#### North Star Metric

- `Meaningful Connections per Weekly Active User (MC/WAU)`

Definition: A "meaningful connection" = mutual match + at least 10 messages exchanged OR 1 completed voice interaction.

#### KPI List (MVP)

Acquisition / Activation
- Install -> signup completion rate
- Signup -> profile completion rate
- Time to first conversation (TTFC)
- Day 0 first chat start rate

Engagement
- DAU/WAU
- Avg sessions/day
- Anonymous chat starts/user/week
- Match rate (% of likes converting to matches)
- Messages per conversation
- Moments view-to-post conversion

Retention
- D1, D7, D30 retention
- Conversation reactivation rate
- Notification open rate

Safety / Quality
- Report rate per 1,000 chats
- Block rate per 1,000 matches
- Moderation response SLA
- Fake/spam detection precision/recall (if model/manual rules)

Tech / Ops
- Crash-free users %
- p95 API latency
- Message delivery latency
- App startup time

### 1.8 Risks, Constraints, Assumptions, Out-of-Scope

#### Risks

- Abuse/harassment/scam behavior in anonymous chat
- App store review scrutiny for social/dating behavior
- Real-time reliability issues in low bandwidth markets
- Low retention if chat quality is poor
- Cold-start supply imbalance (too few active users)

#### Constraints

- Small team may limit custom moderation tooling initially
- iOS/Android parity required
- Budget may delay voice/video and gifts
- Regional laws for privacy and data deletion

#### Assumptions

- Users accept profile-light onboarding if first chat is fast
- Phone auth increases safety but adds SMS cost
- MVP can launch without full IAP monetization

#### Out of Scope (MVP)

- Video calling
- Livestreaming
- Creator marketplace
- Advanced ML recommendation engine
- Web client

---

## 2) Feature Scope (MVP + Post-MVP)

### 2.1 Feature Priority List (P0 / P1 / P2)

| Module | Priority | Notes |
|---|---|---|
| Auth + onboarding | P0 | Required for access and safety controls |
| Profile + avatar basics | P0 | Minimal identity creation |
| Anonymous timed chat (3-min) | P0 | Core differentiator |
| Discovery/swipe matching | P0 | Core loop |
| Direct messaging (text) | P0 | Retention loop |
| Moments feed (basic) | P1 | Community layer |
| Push notifications | P0 | Engagement and reactivation |
| Safety/report/block | P0 | Mandatory |
| Admin moderation console (light) | P1 | Can be internal-only web tool |
| Voice interaction (1:1 lite) | P1 | Nice-to-have for MVP+, core for v1 |
| Virtual gifts + IAP | P2 | Monetization later |
| Avatar customization advanced shop | P2 | Monetization/content depth |
| Premium subscription/boosts | P2 | Growth/monetization |

### 2.2 User Stories, Acceptance Criteria, Edge Cases

Major modules below include 3-10 stories each.

### Module A: Auth & Onboarding (P0)

#### User Stories

1. As a new user, I can sign up with phone or email so I can start using the app.
2. As a returning user, I can log in securely and stay signed in.
3. As a user, I can verify my code (OTP) and recover access if I retry.
4. As a user, I can accept terms/privacy and age confirm 18+.
5. As a user, I can complete a short onboarding (name, DOB, interests, photos/avatar) quickly.
6. As a user, I can skip optional profile fields and continue.

#### Acceptance Criteria

1. Signup supports phone OTP and/or email OTP/password (per config).
2. Invalid OTP shows clear error and retry cooldown timer.
3. User cannot access app without accepting terms/privacy.
4. Age gate blocks under-18 accounts in MVP markets.
5. Onboarding completes in <= 5 required steps.
6. Session persists across app restarts until logout/token expiry.
7. Expired token triggers silent refresh or login prompt.

#### Edge Cases / Failure Modes

- No SMS delivery / delayed OTP
- User changes phone mid-flow
- Time drift affects OTP expiration
- Network drop during onboarding submit
- Duplicate account by same device/phone/email
- Permission denial for photo library/camera
- Backend auth service down

### Module B: Profile & Avatar Basics (P0)

#### User Stories

1. As a user, I can create a profile with display name, age range, bio, and interests.
2. As a user, I can upload profile photos or choose an avatar style.
3. As a user, I can edit my profile anytime.
4. As a user, I can set discovery preferences (age, region, intent).
5. As a user, I can control privacy (show age, show distance, message requests).

#### Acceptance Criteria

1. Required fields are validated client-side and server-side.
2. Photo upload enforces file type/size limits.
3. Image uploads show progress and recover from retry.
4. Profile edits reflect in discovery within defined sync window (e.g., < 60s).
5. Privacy settings are applied consistently in profile API responses.

#### Edge Cases / Failure Modes

- Partial upload succeeds for one photo but not others
- Low storage on device during image processing
- Unsupported image format (HEIC/WebP handling)
- Duplicate/empty display names
- Profile save conflict from multi-device edit

### Module C: Anonymous Timed Chat (P0 Core)

#### User Stories

1. As a user, I can join a queue for an anonymous timed chat.
2. As a user, I am matched with another online user based on filters/availability.
3. As a user, I can chat anonymously for 3 minutes with countdown visible.
4. As a user, I can end early or report/block during the session.
5. As a user, I can choose to reveal profile / express interest after the timer.
6. As a user, I can be re-queued quickly for another session.
7. As a user, I can receive a system prompt if the other user disconnects.

#### Acceptance Criteria

1. Queue join confirms status and estimated wait time (or "finding partner").
2. Session starts only after both users are assigned and server confirms room.
3. Countdown timer is synchronized to server time (+/-2s tolerated).
4. Messages are delivered in near real-time (target p95 < 800ms server processing).
5. Session ends automatically at time limit and input is disabled.
6. Post-chat CTA allows pass, reveal interest, or report.
7. Reporting immediately prevents rematch between the same pair.

#### Edge Cases / Failure Modes

- No available partners / long queue time
- One user disconnects before first message
- Network drop mid-session and reconnection within grace window
- Message duplicates/out-of-order delivery
- Server time skew vs client timer
- Abuse text during anonymous session
- Queue collapse during traffic spikes

### Module D: Discovery & Swipe Matching (P0)

#### User Stories

1. As a user, I can browse discovery cards of potential connections.
2. As a user, I can like/pass profiles quickly.
3. As a user, I can receive a match when interest is mutual.
4. As a user, I can filter discovery by preferences.
5. As a user, I can undo the last pass/like (optional premium later).

#### Acceptance Criteria

1. Discovery cards load paginated with placeholders/loading states.
2. Like/pass action responds in < 300ms perceived time (optimistic UI allowed).
3. Mutual like triggers match event and notification.
4. Hidden/blocked users never appear in discovery.
5. Empty state shows recovery options (expand filters, retry later).

#### Edge Cases / Failure Modes

- No candidates available
- Duplicate cards due to pagination cache issue
- Filter too narrow
- Like action saved client-side but API failed (retry reconciliation)
- User deleted account after appearing in deck

### Module E: Direct Messaging (Text) (P0)

#### User Stories

1. As matched users, we can send and receive text messages in real time.
2. As a user, I can view conversation list with unread counts.
3. As a user, I can block/report from a chat thread.
4. As a user, I can send basic media (image) if enabled in MVP.
5. As a user, I can see delivery state (sent/delivered/read, if enabled).
6. As a user, I can archive or unmatch a conversation.

#### Acceptance Criteria

1. Messages persist and reload after app restart.
2. Conversations are sorted by latest activity.
3. Unread counts clear when thread is opened and messages synced.
4. Block/unmatch immediately disables further sends from both sides.
5. Media messages validate type/size and show upload progress.

#### Edge Cases / Failure Modes

- Offline message compose then reconnect
- Attachment upload partially completes
- Push notification tap opens deleted/unmatched thread
- Message ordering race across multiple devices
- Chat service outage / fallback banner

### Module F: Moments Feed (P1)

#### User Stories

1. As a user, I can browse a feed of public moments/posts.
2. As a user, I can create a text/photo moment.
3. As a user, I can like/react/comment on a moment.
4. As a user, I can delete my own moment.
5. As a user, I can report inappropriate content.
6. As a user, I can view profiles from feed interactions.

#### Acceptance Criteria

1. Feed loads paginated with pull-to-refresh.
2. Composer supports text length + photo validation rules.
3. Reactions/comments update count optimistically and reconcile on API response.
4. Deleted content disappears from own feed immediately.
5. Report action confirms success and hides content if policy requires.

#### Edge Cases / Failure Modes

- Duplicate feed items after refresh pagination merge
- Post upload interrupted on slow network
- Comment spam or rate-limit trigger
- Moderated/removed content while user is viewing it
- CDN image broken/expired URL

### Module G: Voice Interaction (P1 MVP+ / v1)

#### User Stories

1. As a user, I can start or accept a 1:1 voice session with a matched user.
2. As a user, I can mute/unmute and end the session.
3. As a user, I can receive permission prompts for microphone.
4. As a user, I can report/block during or after voice interaction.

#### Acceptance Criteria

1. Voice session setup succeeds or fails with clear reason within timeout.
2. Microphone permission denial shows recovery path.
3. Session end reason is logged (completed, declined, dropped, blocked).
4. Call state persists correctly through app background/foreground (platform-dependent limits documented).

#### Edge Cases / Failure Modes

- Permission denied
- App backgrounded/killed during call
- Network jitter/packet loss/high latency
- VoIP token push delays (iOS)
- RTC service outage/region issues

### Module H: Safety / Moderation / Trust (P0)

#### User Stories

1. As a user, I can report abusive users/content with reason categories.
2. As a user, I can block users and prevent future interaction.
3. As a user, I can mute notifications from a specific thread.
4. As an admin/moderator, I can review reports and take action.
5. As an admin/moderator, I can suspend users and remove content.

#### Acceptance Criteria

1. Report reasons include harassment, spam, scam, sexual content, hate, self-harm concern, other.
2. Blocking removes visibility in discovery/chats/feed interactions per policy.
3. Moderator actions are auditable with actor, timestamp, reason.
4. User receives generic enforcement notice (no sensitive moderator details).

#### Edge Cases / Failure Modes

- Report submission while offline (queue or fail with retry)
- Mass false reports
- Appeals process absent in MVP (documented)
- Cross-feature visibility inconsistency after block

### Module I: Notifications (P0)

#### User Stories

1. As a user, I receive push notifications for matches and messages.
2. As a user, I can manage notification preferences.
3. As a user, tapping a notification deep-links into the relevant screen.

#### Acceptance Criteria

1. Device token registration refreshes on app reinstall/token rotate.
2. Notification payload supports deep link and fallback route.
3. Preference changes apply to future notifications within 1 minute.

#### Edge Cases / Failure Modes

- Token invalid/expired
- Deep link target deleted (e.g., unmatched chat)
- Notification arrives before local data sync

### 2.3 Post-MVP Feature Expansion (P2+)

- Group voice rooms with host/mod tools
- Virtual gifts and inventory
- Premium boosts and subscriptions
- Advanced avatar customization and shop
- Video chat (with consent gating)
- Safety scoring and automated moderation classifiers
- Event campaigns, quests, seasonal themes
- Recommendation ranking models and personalization

---

## 3) Recommended Tech Stack (2-3 Options + Primary Pick)

### 3.1 Cross-Platform App Options

| Option | Stack | Pros | Cons | Fit | Complexity |
|---|---|---|---|---|---|
| A (Primary) | Flutter | Strong UI consistency, excellent performance, one codebase, mature tooling, fast iteration | Some native plugin work for advanced RTC/notifications; fewer JS devs available in some markets | Best for design-heavy app with animations + Android/iOS parity | Medium |
| B | React Native (TypeScript) | Reuse JS/TS talent, large ecosystem, faster backend/front-end context switching | Performance tuning can be harder for chat/animations; native bridging still needed | Good if team already strong in React | Medium |
| C | Native (Swift + Kotlin) | Best platform-native UX and deep integrations | Highest cost/time, dual codebases, slower feature parity | Best only if budget and team size are large | High |

### 3.2 Primary Recommendation (Why)

Choose `Flutter` for MVP/v1 because:

- Core experience depends on polished interactions (timers, cards, chat UI, voice controls)
- Strong single-codebase velocity helps small teams
- Predictable UI across low-end Android + iOS
- Good support for offline storage, push, and analytics SDKs

### 3.3 Mobile App Stack Details (Primary Option)

- Language: `Dart`
- State management: `Riverpod` (or `Bloc` if team already experienced)
- Navigation: `go_router`
- Networking: `Dio` + typed API models
- Local storage: `Hive` or `Isar` (cache/preferences) + `sqflite/Drift` for structured offline chat cache
- Realtime/RPC: WebSocket + REST hybrid
- Image caching: `cached_network_image`
- Feature flags / remote config: Firebase Remote Config or LaunchDarkly (later)
- Crash reporting: Firebase Crashlytics / Sentry
- Analytics: Mixpanel or Amplitude + Firebase Analytics (optional dual-stack)
- Push: FCM (Android + iOS APNs via FCM)
- RTC (voice): Agora / LiveKit / Twilio (compare below)

### 3.4 Backend Options (2-3 viable)

#### Backend Option 1 (Primary): `NestJS + PostgreSQL`

Pros
- TypeScript across backend and tooling
- Strong modular architecture and validation
- Good fit for REST + WebSockets
- Easy onboarding for startup teams

Cons
- Runtime overhead vs Go
- Requires discipline for query optimization

Complexity: Medium

#### Backend Option 2: `Laravel + PostgreSQL`

Pros
- Rapid MVP delivery, batteries included
- Excellent auth/admin tooling ecosystem
- Good developer productivity

Cons
- Realtime scaling usually needs extra architecture choices
- Multiple languages if mobile team is TS-centric

Complexity: Low-Medium

#### Backend Option 3: `Go (Gin/Fiber) + PostgreSQL`

Pros
- High performance, efficient concurrency for chat systems
- Lower infra cost at scale

Cons
- Slower MVP iteration for product-heavy changes
- Smaller full-stack pool for rapid startup work

Complexity: Medium-High

### 3.5 Backend Supporting Services (Recommended)

- API/App server: `NestJS`
- Realtime gateway: `NestJS WebSocket` (or dedicated service)
- DB: `PostgreSQL` (primary relational store)
- Cache/session/rate limiting: `Redis`
- Queue/jobs: `BullMQ` + Redis (notifications, moderation jobs, retries)
- Object storage: `S3-compatible` (AWS S3, Cloudflare R2, Backblaze B2)
- CDN: CloudFront / Cloudflare
- Search (later): OpenSearch / Meilisearch for users/posts

### 3.6 Auth Strategy

MVP auth methods (configurable)
- Phone OTP (recommended for safety and lower fake rate)
- Email OTP or passwordless
- OAuth (Google/Apple) for faster signup (especially iOS: Sign in with Apple if social sign-in offered)

Token strategy
- Short-lived access token (`JWT`, 15-30 min)
- Refresh token rotation (server-stored hash, revocable)
- Device/session table with metadata (device id, OS, push token)
- Token invalidation on suspicious behavior/logout/password reset

### 3.7 Real-Time Needs

#### Messaging + Presence

- WebSockets for chat message delivery, typing, presence (optional MVP)
- Fallback to push notifications when offline/backgrounded

#### Voice

Use managed RTC provider for speed:
- `Agora`: strong mobile RTC, global coverage, quick integration
- `LiveKit Cloud`: modern architecture, flexible, developer-friendly
- `Twilio Voice/Video`: mature but can cost more

Recommendation: `Agora` or `LiveKit` for MVP/v1.

### 3.8 Analytics, Crash, Logs

- Product analytics: `Amplitude` or `Mixpanel`
- Crash reporting: `Sentry` or `Crashlytics`
- Backend logs: structured JSON to `CloudWatch` / `Datadog` / `Grafana Loki`
- Trace/APM: `OpenTelemetry` + vendor backend (Datadog/New Relic/Grafana Tempo)

### 3.9 Payments / Subscriptions / IAP (If/When Needed)

For digital goods and in-app features on mobile:
- Use Apple IAP + Google Play Billing (required for digital content/features)
- Use a wrapper like `RevenueCat` to simplify entitlements and subscription state

Rules to respect
- Do not route digital purchases to external payment links in-app
- Physical goods/services rules differ (not applicable unless added later)

### 3.10 Localization, Accessibility, Security Libraries

- Localization: Flutter `intl`, ARB files, translation pipeline
- Accessibility: semantic labels, dynamic text scaling, contrast tokens
- Security: secure storage (`flutter_secure_storage`), SSL pinning (optional/high-risk), jailbreak/root detection (optional), device integrity signals later

### 3.11 CI/CD Tooling Options

| Tool | Pros | Cons | Best Use |
|---|---|---|---|
| GitHub Actions + Fastlane (Primary) | Flexible, low cost, code + CI in one place | Requires setup work | Teams already on GitHub |
| Codemagic | Excellent Flutter support, mobile-focused | Monthly cost scales | Fast mobile CI onboarding |
| Bitrise | Mature mobile CI/CD | Cost can rise quickly | Larger mobile teams |

Primary: `GitHub Actions + Fastlane` for cost control and customization.

---

## 4) Architecture & Engineering Plan

### 4.1 High-Level Architecture Diagram (Description)

Client Layer
- Flutter mobile app (Android/iOS)
- Local cache (chat, profile, feed cache, settings)
- Push notifications (FCM/APNs)
- RTC SDK (voice)

Platform/API Layer
- API Gateway / Load Balancer
- Auth service (OTP, token issuance, session management)
- Core API (users, discovery, matches, chats, feed, moderation)
- Realtime gateway (WebSockets for chat/presence)
- Notification service (push dispatch)
- Media service (upload signing, moderation hooks)
- Moderation service/rules engine (keyword rules/manual queue initially)
- Admin portal (web)

Data Layer
- PostgreSQL (primary relational data)
- Redis (cache, queues, rate limit, ephemeral session state)
- Object storage + CDN (images/media)
- Analytics warehouse (later: BigQuery/Snowflake)

Third-Party
- SMS provider (Twilio/MessageBird/Vonage/local aggregator)
- Push (FCM/APNs)
- RTC provider (Agora/LiveKit)
- Analytics/crash vendor

### 4.2 App Folder Structure Recommendation (Flutter)

```text
mobile/
  lib/
    app/
      app.dart
      router.dart
      bootstrap.dart
    core/
      config/
      constants/
      errors/
      logging/
      network/
      storage/
      utils/
      widgets/
    features/
      auth/
        data/
        domain/
        presentation/
      onboarding/
      profile/
      discovery/
      timed_chat/
      messages/
      moments/
      voice/
      notifications/
      safety/
    shared/
      models/
      services/
      theme/
      localization/
    main_dev.dart
    main_staging.dart
    main_prod.dart
  test/
  integration_test/
  android/
  ios/
```

### 4.3 Backend Folder Structure Recommendation (NestJS)

```text
backend/
  src/
    modules/
      auth/
      users/
      discovery/
      matches/
      chats/
      timed-chat/
      moments/
      moderation/
      notifications/
      media/
      admin/
    common/
      guards/
      interceptors/
      filters/
      dto/
      utils/
      config/
    realtime/
    jobs/
  prisma/ or db/migrations/
  test/
  scripts/
```

### 4.4 API Style, Versioning, Pagination, Errors

#### API Style

- REST for most app interactions (`/v1/...`)
- WebSockets for realtime messaging/events
- Optional GraphQL later for feed/discovery experimentation (not MVP)

#### Versioning

- URL versioning: `/api/v1`
- Non-breaking additions only within major version
- Deprecation window documented (e.g., 90 days)

#### Pagination

- Cursor-based pagination for feed, chats, discovery
- Avoid page-number pagination for high-write tables

#### Error Format (Standard)

```json
{
  "error": {
    "code": "OTP_INVALID",
    "message": "The verification code is invalid or expired.",
    "requestId": "req_123",
    "details": {
      "retryAfterSeconds": 30
    }
  }
}
```

### 4.5 Data Models / Entities (Core)

Core entities
- `User`
- `UserProfile`
- `UserPreference`
- `AuthIdentity` (phone/email/oauth)
- `Session`
- `Device`
- `AvatarConfig`
- `DiscoveryAction` (like/pass)
- `Match`
- `TimedChatQueueEntry`
- `TimedChatSession`
- `TimedChatMessage`
- `Conversation`
- `ConversationParticipant`
- `Message`
- `MessageAttachment`
- `MomentPost`
- `MomentComment`
- `MomentReaction`
- `Report`
- `Block`
- `ModerationAction`
- `NotificationPreference`
- `PushDeviceToken`
- `FeatureFlagSnapshot` (optional)
- `AuditLog` (admin actions)

Relationships (high level)
- `User 1:1 UserProfile`
- `User 1:N Sessions/Devices`
- `User N:N User via Match`
- `Match 1:1 Conversation` (optional direct mapping)
- `Conversation 1:N Message`
- `User 1:N MomentPost`
- `MomentPost 1:N Comment/Reaction`
- `User 1:N Report`
- `Report N:1 target (polymorphic)` via typed target fields
- `User N:N User via Block`

### 4.6 Offline Strategy

MVP offline goals
- App remains browsable for cached screens (recent chats/feed/profile)
- Outgoing text messages queue while offline (if thread exists)
- Actions retry safely on reconnect

Approach
- Local DB for chats/conversations/feed cache
- "Pending action queue" with idempotency keys
- Last-write-wins for low-risk profile fields
- Server-authoritative for matches, timers, moderation, balances

Conflict Resolution Rules
- Profile edits: latest server timestamp wins; client shows sync conflict banner if needed
- Messages: client generates temp IDs, server returns canonical IDs and timestamps
- Feed reactions: optimistic local increment then reconcile server count

### 4.7 Performance Plan

Targets (MVP)
- Cold start < 3.0s mid-tier device
- Frame drops minimized in chat/discovery (60fps target)
- Image payloads optimized (< 300KB thumbnails where possible)
- p95 API latency < 500ms for common endpoints (excluding media upload)

Tactics
- Thumbnail + full-size image variants
- CDN caching headers
- Lazy loading and prefetch next discovery cards
- WebSocket connection reuse
- Batch analytics events
- Debounce search/filter changes
- Background image compression before upload

### 4.8 Feature Flags & Remote Config

Use cases
- Enable/disable voice
- Adjust queue timeout
- A/B test onboarding steps
- Change daily quota or prompts
- Kill-switch for problematic feature

Implementation
- Fetch remote config at app start + periodic refresh
- Cache last good config locally
- Server-side flag evaluation for security-sensitive features

### 4.9 Secrets Management & Environments

Environments
- `dev`
- `staging`
- `prod`

Rules
- No secrets in repo
- Mobile app stores only public config (API base URL, public keys)
- Sensitive secrets in CI secret store / cloud secrets manager
- Separate Firebase projects, bundle IDs/package IDs per environment
- Separate API keys for SMS/RTC/analytics by environment

Recommended secret storage
- AWS Secrets Manager / GCP Secret Manager / Doppler / 1Password Secrets Automation

---

## 5) UX/UI & Design Deliverables

### 5.1 Wireframes List (Include States)

#### Core Navigation / Shell

- Splash / bootstrap state
- Onboarding entry
- Tab bar shell (Discovery, Timed Chat, Messages, Moments, Profile)

#### Auth + Onboarding

- Login/signup method selection
- Phone/email entry
- OTP verification
- Terms/privacy + age gate
- Profile setup stepper (name, DOB, interests, photo/avatar)
- Permission prompts (notifications, microphone, photos)
- Empty/error/loading states for each step

#### Discovery & Matching

- Discovery card deck
- Filters/preferences modal
- Match success modal
- No candidates state
- Retry / network error state

#### Timed Anonymous Chat

- Queue / waiting screen
- Match found transition
- Timed chat screen (countdown visible)
- Disconnect/reconnect banner
- Session ended screen (reveal/pass/report)
- No partner / timeout state

#### Messaging

- Conversation list (empty + loaded)
- Chat thread
- Media upload progress state
- Block/report modal
- Unmatch confirmation

#### Moments Feed

- Feed list
- Composer (text/photo)
- Post detail + comments
- Empty feed state
- Moderated/removed content state

#### Voice (if MVP+)

- Incoming voice request prompt
- Voice session screen
- Mic permission denied state
- Reconnect/poor network state

#### Profile / Settings / Safety

- Own profile view/edit
- Avatar customization basics
- Notification settings
- Privacy settings
- Report center / safety tips
- Account deletion flow

### 5.2 Design System Tokens (Colors, Typography, Spacing)

Selected visual direction: minimal dual-theme UI (graphite neutrals + EYYMI mint accent).

Use this as the default design system palette unless the team confirms a different scheme during visual exploration.

#### Color Tokens (Final Dual Theme)

- `primary`: `#14B8A6` (EYYMI mint)
- `primaryPressed`: `#0F766E`
- `bgDark`: `#0F1012` (dark canvas)
- `surfaceDark`: `#17181B` (dark surface)
- `elevatedDark`: `#1F2024`
- `textDark`: `#F5F5F5`
- `borderDark`: `rgba(255,255,255,0.10)`
- `bgLight`: `#F5F5F5` (light canvas)
- `surfaceLight`: `#FFFFFF` (light surface)
- `elevatedLight`: `#ECECEF`
- `textLight`: `#141417`
- `borderLight`: `rgba(20,20,23,0.10)`
- `success`: `#22C55E`
- `warning`: `#F59E0B`
- `error`: `#EF4444`
- `info`: `#8EA3FF` (secondary route/partner visual)

Usage notes:
- Keep mint for primary actions, active states, and progress indicators.
- Keep surfaces mostly neutral in both themes.
- Use the `info` accent sparingly for secondary route/partner visuals.
- Verify contrast for both dark and light mode before final UI sign-off.

#### Recommended Token Structure

- Color: `primary`, `secondary`, `accent`, `bg`, `surface`, `text`, `border`, `success`, `warning`, `error`
- Typography (Android-like mobile sizing):
  - Label Small (`11`)
  - Label Medium (`12`)
  - Body Medium (`14`)
  - Body Large (`16`)
  - Title Large (`22`)
  - Headline Small (`24`)
  - Headline Medium (`28`)
- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48`
- Radius scale: `8, 12, 16, 24, pill`
- Elevation: `sm, md, lg`
- Motion durations: `120ms`, `200ms`, `300ms`

#### Typography Guidance

- Use a readable, character-supportive font stack for multilingual support.
- Prefer one primary typeface plus fallback for localization (Latin + target scripts).
- Avoid overly thin weights in low-end Android rendering.

### 5.3 Components List (Design System)

- Buttons (primary/secondary/ghost/destructive/icon)
- Inputs (text, phone, OTP, search)
- Selects / chips / pills
- Toggles / checkboxes / radio
- Cards (profile, feed, stat, action)
- Avatars / badges / verification tags
- Chat bubbles (incoming/outgoing/system)
- Timers / countdown indicator
- Bottom sheets / modals / dialogs
- Toasts / snackbars / banners
- Tabs / tab bar / segmented control
- Empty states / error states / loading skeletons
- Media picker / upload progress component
- Report/block action sheet

### 5.4 Accessibility Checklist

- Touch targets >= 44x44 pt
- Contrast ratio meets WCAG AA (text and controls)
- Dynamic text scaling support tested (iOS/Android)
- Screen reader labels for all icon-only buttons
- Logical focus order and focus visibility
- Haptic feedback optional, not sole feedback channel
- Color not used as only status indicator
- Captions/labels for voice-related prompts and permission states
- Motion reduction support (reduced motion mode)
- Error messages programmatically tied to fields

### 5.5 Copywriting / UX Writing Guidance

- Tone: warm, clear, safety-forward, low-pressure
- Avoid manipulative urgency language
- Use short CTAs: `Start chat`, `Try again`, `Reveal profile`, `Report user`
- Explain why permissions are needed before OS prompt
- Safety copy should be concrete: what happens after report, what block does
- Localize colloquialisms carefully; avoid slang in safety/legal content

### 5.6 Design Handoff Process (Figma Conventions)

- Page naming: `00-Foundations`, `01-Flows`, `02-Screens`, `03-Components`, `04-Assets`
- Frame naming: `Feature / Screen / State / Platform`
- Components use variants and token-based colors
- Include redlines/specs for spacing, typography, and behaviors
- Document interactions and transitions (especially timed chat and match animations)
- Tag assets with export sizes and formats (`@1x/@2x/@3x`, SVG where possible)
- Use developer-ready notes for edge states and empty/error/loading screens

---

## 6) Project Timeline & Milestones (with Estimates)

### 6.1 Realistic Timeline Summary (MVP + v1)

Assumption: MVP includes P0 + selected P1 (moments basic, safety tools, push). v1 adds voice and stronger moderation/admin.

| Team Setup | MVP Timeline | v1 Timeline (after MVP) | Notes |
|---|---:|---:|---|
| Solo dev | 20-28 weeks | +10-16 weeks | High risk for app-store + ops + QA quality |
| 2 devs | 14-20 weeks | +8-12 weeks | Best lean startup balance |
| 4-person core team | 10-14 weeks | +6-10 weeks | Requires strong coordination |

### 6.2 Phase Breakdown

- Discovery
- Product spec + architecture
- UX/UI design
- Backend foundation + infra
- Mobile foundation
- Feature implementation
- QA hardening
- Beta
- Launch
- Post-launch stabilization

### 6.3 Week-by-Week Plan (Reference for 2-Dev Team, ~16 Weeks MVP)

#### Weeks 1-2: Discovery & Definition

Deliverables
- Product requirements draft (MVP scope frozen)
- User journeys
- KPI framework + event taxonomy v1
- Risk register
- Architecture decision record (ADR)

Definition of Done
- Scope tagged P0/P1/P2 and approved
- Success metrics and launch gate agreed

#### Weeks 3-4: UX/UI & Technical Setup

Deliverables
- Wireframes for all MVP flows (including states)
- Visual direction + selected color scheme
- Design tokens + component starter set
- Repo setup, CI skeleton, environment strategy
- Backend schema draft and API contracts

DoD
- Click-through prototype for core journeys
- CI builds on pull request
- Seed environments (`dev`, `staging`) reachable

#### Weeks 5-6: Core Platform Foundation

Deliverables
- Auth backend + token/session flows
- Mobile auth/onboarding shell
- Profile CRUD
- Database migrations and base observability
- Push token registration plumbing

DoD
- New user can signup/login and save profile on staging
- Crash/analytics events visible in dashboards

#### Weeks 7-9: Core Experience Build (Discovery + Timed Chat + Messaging)

Deliverables
- Discovery deck + like/pass APIs
- Match creation flow
- Timed chat queue/session service
- Realtime text messaging foundation
- Conversation list/thread screens

DoD
- End-to-end happy path works on staging across two real devices
- Core instrumentation tracked

#### Weeks 10-11: Moments + Safety + Notifications

Deliverables
- Moments feed + composer (basic)
- Report/block flows
- Notification preferences
- Push deep links
- Basic moderation admin panel/internal tools

DoD
- Report/block enforcement consistent across discovery/chat/feed
- Push opens correct destination

#### Weeks 12-13: QA Hardening + Edge Cases

Deliverables
- Regression suite (manual + automated smoke)
- Performance optimizations
- Retry/offline behaviors for critical actions
- Crash/ANR review and fixes

DoD
- Release candidate meets crash-free target
- Top severity defects closed/waived with signoff

#### Week 14: Beta (Internal + Closed Group)

Deliverables
- TestFlight + Play internal testing build
- Beta feedback form + triage cadence
- Moderation runbook and incident contact list

DoD
- 20-50 testers complete key journeys
- No blocker defects remain

#### Week 15: Store Prep & Launch Readiness

Deliverables
- Store listings, screenshots, privacy forms
- Legal docs (privacy policy, terms, deletion instructions)
- Rollout plan + on-call roster

DoD
- Submission packages complete
- Monitoring dashboards + alerts live

#### Week 16: Launch & Stabilization

Deliverables
- Staged rollout
- Daily KPI review
- Hotfix process active

DoD
- Launch checklist complete
- Post-launch issue backlog prioritized

### 6.4 Solo / 4-Person Team Adaptation

#### Solo Dev

- Combine weeks 3-4 and 5-6 with reduced scope
- Cut moments or voice from MVP
- Heavier reliance on managed services (Firebase, RevenueCat, hosted moderation tools)
- External QA for pre-launch recommended

#### 4-Person Core Team Example

Roles
- 1 mobile engineer
- 1 backend engineer
- 1 product/design hybrid (or PM + part-time designer)
- 1 QA/ops hybrid

Compression strategy
- Parallel backend/mobile foundations
- Design system and flows finalized earlier (weeks 2-3)
- Begin beta by week 10-12

### 6.5 Critical Path Items & Dependencies

Critical path
- Product scope freeze -> design -> auth/profile -> discovery/matching -> timed chat/messaging -> safety -> QA -> beta -> store submission

Dependencies
- SMS provider contract and sender setup (for phone auth)
- Apple Developer / Google Play accounts
- Push certificates/APNs config
- RTC vendor contract (if voice included)
- Legal docs (privacy/terms)
- Moderation process ownership

---

## 7) Team & Roles Needed

### 7.1 Minimum Team for MVP (Lean)

- 1 Product lead (can be founder/PM)
- 1 Mobile engineer (cross-platform)
- 1 Backend engineer
- 1 Designer (part-time/contract okay)
- 1 QA (part-time during hardening) or disciplined test ownership by engineers
- 1 DevOps owner (part-time; often backend engineer initially)

### 7.2 Ideal Team for Scale (v1+)

- PM
- Product Designer
- Mobile Engineer A (feature/UI)
- Mobile Engineer B (platform/performance)
- Backend Engineer A (core APIs)
- Backend Engineer B (realtime/data)
- QA Engineer / SDET
- DevOps / Platform Engineer
- Trust & Safety / moderation ops lead
- Community support specialist
- Data analyst / growth PM (later)

### 7.3 Responsibilities by Role

PM / Product Lead
- Scope, priorities, metrics, roadmap, launch decisions

Designer
- UX flows, visual system, interactive prototypes, handoff, QA on UI polish

Mobile Engineer
- Client architecture, features, state, performance, SDK integrations

Backend Engineer
- API/realtime, data models, queues, infra integration, security controls

QA / SDET
- Test planning, regression, automation, release signoff criteria

DevOps / Platform
- CI/CD, secrets, environments, monitoring, backup/restore, incident readiness

Support / Trust & Safety
- Triage reports, user communication, moderation operations, escalation handling

### 7.4 Hiring vs Outsourcing Guidance

Hire in-house first for:
- Product lead
- At least one senior engineer (mobile or backend)
- Trust-sensitive architecture ownership

Outsource safely for:
- UI design production
- Test execution (with strong test cases)
- Store creatives / ASO
- Some admin tooling

What to look for in candidates/agencies
- Shipped real-time mobile apps
- Experience with app store review and privacy policies
- Clear QA discipline and instrumentation mindset
- Can discuss abuse prevention and moderation tradeoffs
- Can demonstrate performance optimization on low-end Android

---

## 8) Costing & Resourcing

### 8.1 Build Cost Ranges (Rough)

These vary by geography, rates, and in-house vs agency.

| Level | MVP Build Cost Range | Profile |
|---|---:|---|
| Low (lean) | $20k-$60k | Solo/very small team, limited scope, managed services |
| Medium | $60k-$180k | 2-4 person team, solid QA, analytics, moderation basics |
| High | $180k-$500k+ | Faster timeline, stronger design, voice, heavy QA, multiple markets |

Primary cost drivers
- Team size and seniority
- Voice/RTC inclusion
- Moderation tooling and trust/safety operations
- Localization count
- QA depth and device coverage
- Custom recommendation systems vs simple rules

### 8.2 Ongoing Monthly Costs (Typical Early Stage)

| Cost Item | Lean | Moderate | Higher Scale | Notes |
|---|---:|---:|---:|---|
| Cloud hosting/API/DB | $100-$500 | $500-$2,000 | $2,000-$10,000+ | Depends on traffic and region |
| Object storage + CDN | $20-$200 | $200-$1,000 | $1,000-$5,000+ | Media-heavy apps rise quickly |
| SMS OTP | $50-$500 | $500-$3,000 | $3,000-$20,000+ | Major cost lever by country |
| Push notifications | $0-$100 | $0-$200 | $0-$500 | FCM/APNs mostly free |
| RTC voice provider | $0-$300 | $300-$3,000 | $3,000-$25,000+ | Usage-based |
| Analytics + crash | $0-$300 | $300-$1,500 | $1,500-$10,000+ | Free tiers first |
| Monitoring/logs | $0-$200 | $200-$1,000 | $1,000-$8,000+ | Can spike with verbose logging |
| Moderation ops/tools | $0-$500 | $500-$5,000 | $5,000-$50,000+ | Human moderation is expensive |

### 8.3 Tooling / Store Costs

- Apple Developer Program: annual fee (check current local pricing)
- Google Play Console: one-time registration fee (check current pricing)
- Domain + legal docs hosting
- CI service subscription (if not GitHub-hosted only)
- Design tools (Figma)
- Test device cloud (optional, BrowserStack/LambdaTest)

Note: Verify current fees before budgeting because pricing changes.

---

## 9) QA, Testing, and Release Readiness

### 9.1 Test Strategy

#### Unit Tests

- Validation logic
- Reducers/state notifiers/controllers
- Domain services (match logic, timer formatting)
- Backend service methods and auth guards

#### Integration Tests

- Auth flow (OTP mock/staging provider)
- Profile create/edit
- Discovery like->match
- Timed chat session lifecycle
- Messaging send/receive persistence
- Report/block enforcement

#### E2E Tests

- New user onboarding to first chat
- Match via discovery then send messages
- Feed post/comment/report
- Account deletion request flow

#### Manual Exploratory Testing

- Low network / airplane mode transitions
- Permission denial / later enable in settings
- App background/foreground during chat/voice
- Notification deep links
- Device-specific UI rendering

### 9.2 Device Matrix (Minimum)

Android
- Low-end Android (2-4 GB RAM)
- Mid-range Android
- Recent flagship Android
- Android OS versions: cover N-2 or product target policy

iOS
- Older supported iPhone
- Current non-Pro iPhone
- Current larger-screen iPhone
- iOS versions: current and previous major

Also test
- Different screen sizes
- Poor network conditions (2G/3G simulation where possible)

### 9.3 Regression Plan

- Define critical path smoke suite (10-20 cases) run on every release candidate
- Full regression checklist weekly during beta
- Fix verification protocol for P0/P1 bugs
- Maintain a known issues list for test builds

### 9.4 Test Case Categories + Sample Cases

Categories
- Functional
- Usability
- Compatibility
- Network resilience
- Security/privacy
- Performance
- Notification/deep link
- Moderation/safety

Sample test cases
- `AUTH-01`: User receives valid OTP and completes signup
- `AUTH-05`: Invalid OTP shows cooldown and retry
- `TCHAT-03`: Timed session auto-ends exactly at server timeout and disables input
- `DISC-04`: Blocked user does not appear in discovery or feed
- `MSG-07`: Offline message queued and sent after reconnect
- `SAFE-02`: Report submission hides target and creates moderation record
- `NOTIF-06`: Message push deep-links to correct chat thread
- `DEL-01`: Account deletion request removes access and starts data retention workflow

### 9.5 Beta Testing Plan

#### iOS

- TestFlight internal team
- TestFlight external testers (small curated group first)

#### Android

- Internal testing track
- Closed testing track
- Staged production rollout after validation

Beta process
- Recruit 20-100 testers across target devices/regions
- Provide feedback form + in-app `Report a bug`
- Set triage cadence (daily during beta)
- Capture session replay only if compliant and disclosed

### 9.6 Bug Triage Severity Levels + SLA Targets

| Severity | Definition | Example | Target Response | Target Fix |
|---|---|---|---|---|
| S0 | Production outage / severe data or safety incident | Chat service down, report flow broken | < 15 min | Hotfix ASAP |
| S1 | Core feature unusable for many users | Login failure, crashes on open | < 1 hr | 24-48 hrs |
| S2 | Major issue with workaround | Push broken, upload failures on some devices | < 4 hrs | 3-5 days |
| S3 | Minor bug/UI issue | Text overlap | < 1 business day | Planned sprint |
| S4 | Enhancement / polish | Animation jitter | Triage backlog | Scheduled later |

---

## 10) Security, Privacy, and Compliance

### 10.1 Threat Model Checklist (OWASP Mobile-Aligned)

- Insecure local storage (tokens, PII)
- Insecure network transport / MITM risk
- Weak server auth/session handling
- Broken authorization (IDOR on profiles/chats)
- Abuse/spam/bot automation
- Credential stuffing / OTP brute force
- Sensitive data leakage in logs/crash reports
- Reverse engineering/tampering (optional hardening)
- Unsafe third-party SDK data collection
- Admin panel privilege escalation

### 10.2 Data Encryption & Secure Storage

- TLS 1.2+ for all traffic
- Access tokens in secure storage (Keychain/Keystore via secure storage library)
- Refresh tokens rotated and hashed server-side
- Encrypt backups and database at rest (cloud-managed encryption)
- Signed URLs for media uploads/downloads (short TTL for private content)
- Avoid storing sensitive PII in plaintext logs

### 10.3 Privacy Policy Needs, Consent Flows, Data Retention, Deletion

Privacy policy must cover
- Data collected (profile, device, usage, messages/media metadata)
- Why it is collected
- Third-party processors (SMS, analytics, crash, RTC, storage)
- Retention periods
- User rights (access, correction, deletion)
- Contact method for privacy requests

Consent flows
- Terms + privacy acceptance during onboarding
- Notification permission pre-prompt explanation
- Microphone permission rationale before voice use
- Optional analytics/marketing consent by region

Data retention (example policy to validate legally)
- Inactive accounts: retain for defined period (e.g., 12-24 months)
- Deleted account: immediate access revocation + queued deletion/anonymization within policy SLA (e.g., 30 days)
- Safety/audit logs may be retained longer for legal/security reasons

Account deletion
- Self-serve delete flow in settings
- Password/OTP re-auth before deletion
- Confirmation of consequences
- Deletion status confirmation email/SMS (if available)

### 10.4 GDPR/CCPA Basics (If Applicable)

- Provide lawful basis and consent where required
- Allow data subject requests (access/delete/correct)
- Support Do Not Sell/Share disclosures if applicable
- Minimize data collection and document processors
- Maintain records of processing activities (at scale)

### 10.5 Minors / Sensitive Domains Considerations

- MVP assumes 18+ only; enforce age gate and policy copy
- If minors later supported, entire safety/compliance model changes (parental consent, stricter moderation, child safety law compliance)
- This app is not health/finance, but still handles sensitive personal interaction data and requires strong safety controls

### 10.6 Secure API Practices

- JWT validation + refresh rotation
- Rate limiting by IP/device/user for OTP and auth endpoints
- Authorization checks on every resource access
- Input validation and output encoding
- Idempotency keys for retriable actions
- Audit logs for admin/moderation actions
- Request IDs for traceability
- WAF/bot mitigation at edge (Cloudflare/AWS WAF)
- Secret rotation schedule and least privilege IAM

---

## 11) App Store & Launch Plan

### 11.1 App Store / Play Store Requirements Checklist

- App name availability check
- Unique package/bundle identifiers
- Privacy policy URL
- Terms of service URL
- Age rating questionnaires completed accurately
- Content moderation/safety disclosures
- Data safety form (Google Play)
- App privacy nutrition labels (Apple)
- Screenshots for all required device classes
- Demo credentials (if requested for review)
- Support URL and contact email

### 11.2 Screenshots, Metadata, Keywords, ASO Plan

Metadata
- Clear value proposition in first two lines
- Emphasize safe, personality-first social discovery
- Avoid misleading claims
- Localize store copy for target markets

Screenshot set (minimum)
- Onboarding / profile setup
- Timed anonymous chat
- Discovery and matching
- Messages
- Moments/community
- Safety/report controls (optional but helpful)

ASO basics
- Keyword research by market/language
- Test icon + subtitle variations
- Track conversion from store listing to install
- Refresh creative seasonally

### 11.3 Review Risks & Rejection Avoidance

Common risks
- Insufficient moderation/reporting controls
- Misleading age rating
- Incomplete privacy disclosures
- Broken login for reviewer (OTP issue)
- In-app purchase rule violations (later)
- User-generated content without moderation/reporting path

Mitigations
- Ensure visible report/block in chat/feed/profile
- Provide reviewer notes with test account/test OTP path
- Include moderation policy and response process
- Verify all links (privacy/terms/support) work

### 11.4 Rollout Strategy + Launch Monitoring

Rollout
- Soft launch in 1-2 smaller markets
- Android staged rollout (5% -> 25% -> 100%)
- iOS phased release if desired
- Pause rollout if S0/S1 thresholds breached

Launch monitoring (first 72 hours)
- Signup completion
- Crash-free users
- Message delivery latency
- Report volume spikes
- OTP failure rate
- API/DB utilization
- App store reviews and support tickets

---

## 12) Post-Launch Growth & Operations

### 12.1 Analytics Event Taxonomy (What to Track)

Define a consistent naming convention, e.g. `domain_object_action`.

Core events (examples)
- `app_opened`
- `onboarding_started`
- `signup_method_selected`
- `otp_sent`
- `otp_verified`
- `profile_completed`
- `discovery_card_viewed`
- `discovery_like_sent`
- `discovery_pass_sent`
- `match_created`
- `timed_chat_queue_joined`
- `timed_chat_started`
- `timed_chat_ended`
- `timed_chat_reveal_selected`
- `message_sent`
- `message_received`
- `moment_post_created`
- `moment_reaction_added`
- `report_submitted`
- `user_blocked`
- `notification_opened`
- `voice_session_started`
- `voice_session_ended`

Required event properties (examples)
- `user_id`
- `session_id`
- `device_os`
- `app_version`
- `country`
- `language`
- `network_type`
- `experiment_variant` (if applicable)

### 12.2 A/B Testing Plan

Start with low-risk experiments
- Onboarding step count (short vs guided)
- Timed chat queue UI messaging
- Post-chat CTA wording
- Discovery card information density
- Notification copy/timing

Rules
- Define success metric before launch
- Set minimum sample size
- Avoid overlapping experiments on same funnel stage early
- Keep server-side experiment assignment where possible

### 12.3 Retention Hooks & Notifications Strategy

Retention hooks
- Daily starter prompts
- Re-engagement when a match replies
- "People online now" queue nudges
- Streaks/quests (lightweight)
- Content digest from moments

Notification guardrails
- Respect quiet hours/time zones
- Frequency caps
- Actionable notifications only
- Easy preference controls

### 12.4 Customer Support Workflows

Channels
- In-app support form
- Email support
- FAQ/help center

Workflow
1. Ticket intake
2. Auto-categorize (billing/safety/bug/account)
3. SLA assignment
4. Escalate to engineering/moderation as needed
5. Resolve and tag root cause

### 12.5 Incident Response

Minimum runbook
- Severity classification (S0-S4)
- Incident commander assignment
- Internal status channel
- User-facing status message template
- Rollback/hotfix procedure
- Postmortem template within 48 hours for S0/S1

### 12.6 Roadmap Template (30 / 60 / 90 Days Post Launch)

#### First 30 Days

- Stabilize crashes and auth failures
- Tune queue/matching rules
- Improve onboarding conversion
- Close top safety gaps

#### 60 Days

- Add voice (if not launched)
- Improve feed quality and moderation tooling
- Launch first A/B tests
- Start localization expansion

#### 90 Days

- Monetization pilot (gifts/subscription)
- Recommendation improvements
- Deeper analytics dashboards and cohort reporting
- Community growth campaigns

---

## 13) Final Outputs (Required Tables & Checklists)

### 13.1 MVP Scope Table

| Feature | Priority | Est. Effort | Notes |
|---|---|---|---|
| Auth + onboarding | P0 | M | Phone/email OTP, age gate, legal acceptance |
| Profile + avatar basics | P0 | M | Minimal profile + preferences |
| Discovery/swipe | P0 | M | Card deck + like/pass + filters |
| Matching | P0 | S-M | Mutual match creation + notifications |
| Anonymous timed chat | P0 | L | Queue, room assignment, timer sync, report/block |
| Direct messaging (text) | P0 | L | Realtime + persistence + thread list |
| Push notifications | P0 | M | Message/match pushes + deep links |
| Safety/report/block | P0 | M | Mandatory across features |
| Moments feed basic | P1 | M | View/post/react/comment basic scope |
| Moderation admin (internal) | P1 | M | Reports queue + actions |
| Voice 1:1 lite | P1 | M-L | RTC integration and permissions |
| Gifts + IAP | P2 | L | Post-MVP monetization |
| Avatar shop | P2 | M-L | Depends on content pipeline |
| Premium boosts | P2 | M | Requires billing + entitlement |

Legend: `S` = Small, `M` = Medium, `L` = Large

### 13.2 Timeline Table

| Phase | Duration | Output |
|---|---:|---|
| Discovery & scope | 1-2 weeks | MVP PRD, personas, KPIs, scope freeze |
| UX/UI design | 2-4 weeks | Wireframes, visual system, prototype, design specs |
| Foundation engineering | 2-4 weeks | Auth/profile, CI/CD, envs, base backend/mobile architecture |
| Core feature build | 4-8 weeks | Discovery, timed chat, matching, messaging |
| Community + safety + notifications | 2-4 weeks | Feed basic, report/block, push, moderation tooling |
| QA hardening | 1-3 weeks | RC builds, performance tuning, bug fixes |
| Beta | 1-2 weeks | Tester feedback, release candidates |
| Launch prep + rollout | 1-2 weeks | Store assets, submissions, staged rollout |

### 13.3 Tech Stack Decision Table

| Layer | Primary Choice | Alternatives | Why Chosen |
|---|---|---|---|
| Mobile | Flutter | React Native, Native | Fast single-codebase delivery with strong UI/perf |
| State mgmt | Riverpod | Bloc, Provider | Testable, scalable, low boilerplate |
| Backend | NestJS | Laravel, Go | Fast iteration + TS ecosystem + modularity |
| DB | PostgreSQL | MySQL, MongoDB | Relational integrity for social graph and moderation |
| Cache/Queue | Redis + BullMQ | RabbitMQ, SQS | Simple startup setup, common tooling |
| Storage | S3-compatible | GCS, Azure Blob | Standard, scalable, CDN-friendly |
| Realtime chat | WebSockets | Firebase RTDB/Firestore, Socket.IO | Control + cost predictability |
| Voice RTC | Agora / LiveKit | Twilio | Faster launch than self-hosted RTC |
| Analytics | Mixpanel/Amplitude | Firebase Analytics only | Better funnel/cohort analysis |
| Crash | Sentry/Crashlytics | Bugsnag | Mature mobile crash tooling |
| CI/CD | GitHub Actions + Fastlane | Codemagic, Bitrise | Flexible and cost-effective |

### 13.4 Launch Checklist

- [ ] Final MVP scope frozen and signed off
- [ ] Crash reporting and analytics verified in production build
- [ ] Auth, discovery, timed chat, messaging happy paths tested on real devices
- [ ] Report/block flows work across chat, feed, and profiles
- [ ] Privacy policy, terms, support URL, and account deletion flow live
- [ ] Apple/Google store metadata and screenshots completed
- [ ] App privacy/data safety forms completed accurately
- [ ] TestFlight and Play closed testing completed with feedback triaged
- [ ] Monitoring dashboards and alerts configured (API, DB, crash, OTP, queue)
- [ ] Incident response runbook and on-call contacts defined
- [ ] Staged rollout plan and rollback criteria documented
- [ ] Reviewer test credentials/notes prepared (if needed)
- [ ] Post-launch KPI dashboard and daily review cadence scheduled

### 13.5 Risks & Mitigations Table

| Risk | Impact | Likelihood | Mitigation | Owner |
|---|---|---|---|---|
| Abuse in anonymous chat | High | High | Report/block, moderation queue, keyword/rate rules, audit logs | PM + Backend + Moderation |
| Poor retention due to low chat quality | High | Medium | Better prompts, queue logic, onboarding preferences, re-engagement tests | PM + Product Design |
| OTP delivery failures / high SMS cost | High | Medium | Multi-provider support, retries, fallback login, monitor by country | Backend + DevOps |
| Realtime messaging instability | High | Medium | WebSocket retry strategy, observability, load testing, graceful fallback | Backend |
| App store rejection for UGC/safety gaps | High | Medium | Visible moderation tools, policy docs, reviewer notes, safety workflows | PM + QA |
| Scope creep delays MVP | High | High | P0/P1/P2 governance, weekly scope review, freeze date | PM |
| Low-end Android performance issues | Medium | Medium | Performance budgets, image optimization, device matrix testing | Mobile |
| Data/privacy compliance gaps | High | Low-Med | Legal review, deletion flow, retention policy, processor inventory | PM + Legal |

---

## Practical Next Steps (Recommended)

1. Use the finalized dual-theme design system (graphite neutrals + EYYMI mint accent) across UI production.
2. Answer the 8 tailoring questions at the top of this document.
3. Freeze MVP scope using section `13.1`.
4. Convert P0 features into a sprint backlog with point estimates.
5. Create API contracts for auth, timed chat, discovery, and messaging first.
