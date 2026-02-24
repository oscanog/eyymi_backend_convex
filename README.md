# Soul-First Social App Blueprint (iOS + Android)

Planning docs for building a cross-platform mobile app focused on anonymous connection, friend-making, voice interaction, matching, community moments, avatars, and virtual gifting.

This repository currently contains product, engineering, design, QA, launch, and scaling documentation for an MVP-to-v1 build.

## Quick Tailoring Questions (Answer Later If You Want)

These are the minimum questions needed to tighten scope. The blueprint in `docs/` already proceeds with default assumptions if unanswered.

1. What is your primary launch market (country/region) and languages?
2. Is the initial goal friendship-first, dating-first, or mixed?
3. Do you want phone-number signup at MVP, or start with email/OAuth only?
4. Is anonymous 3-minute chat a hard MVP requirement?
5. Do you want in-app purchases and virtual gifts in MVP, or post-MVP?
6. Do you prefer faster delivery (`Flutter`) or stronger web-team reuse (`React Native`)?
7. What is your expected starting team size (solo / 2 devs / 4+ team)?
8. What is your rough MVP budget range (lean / moderate / aggressive)?

## Default Assumptions Used In Docs

- Primary audience: Gen Z adults (18+) in Southeast Asia + LATAM pilot markets
- Positioning: friendship-first with optional dating behavior later
- Platforms: Android + iOS, single codebase
- MVP includes anonymous timed chat, profile, swipe discovery, text chat, moments feed
- Voice interactions are MVP-lite (1:1 voice call or simple voice room), advanced rooms post-MVP
- Gifts + IAP are post-MVP unless budget allows
- Primary stack recommendation: Flutter + NestJS + PostgreSQL

## Color Scheme Choices (Pick 1)

Full token sets are in `docs/color-schemes.md`.

### Option A: `Sunset Pop` (Warm, playful, social)
- Primary: `#FF5A5F`
- Secondary: `#FFB703`
- Accent: `#6C63FF`
- Background: `#FFF8F2`
- Text: `#1E1B18`
- Best for: energetic, expressive, youthful vibe

### Option B: `Aurora Mint` (Fresh, trust-building, modern)
- Primary: `#14B8A6`
- Secondary: `#0EA5E9`
- Accent: `#F97316`
- Background: `#F6FFFE`
- Text: `#102A2A`
- Best for: balanced social + safety-forward brand

### Option C: `Midnight Neon` (Bold, nightlife, voice-heavy)
- Primary: `#00E5A8`
- Secondary: `#1D4ED8`
- Accent: `#FF4DA6`
- Background: `#090C12`
- Text: `#EAF2FF`
- Best for: premium, edgy, late-night interaction feel

## Docs Index

- `docs/mobile-app-build-blueprint.md` — Complete build blueprint from idea to scale
- `docs/color-schemes.md` — 3 UI color system options with token-ready palettes

## Suggested Next Step

Choose a color scheme (`A`, `B`, or `C`). After that, the blueprint can be narrowed into a sprint-ready implementation backlog.

