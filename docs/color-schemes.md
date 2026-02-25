# EYYMI Final Color & Typography System (Dual Theme)

This document replaces the old color options.

The visual direction is now finalized:

- Minimal graphite UI (dark + light mode)
- EYYMI mint accent for identity and actions
- Android-style typography sizing for mobile-first layouts

Important:

- Keep naming generic in code/docs/readme
- Do not reference external apps/brands in implementation text

## Design Intent (Easy Version)

We want a clean, calm interface with:

- mostly neutral surfaces
- strong readability
- one recognizable accent color (EYYMI mint)

This gives a familiar social-app feel while keeping EYYMI visually distinct.

## Core Brand Accent (EYYMI Mint)

| Token | Hex | Usage |
|---|---:|---|
| `color.primary.500` | `#14B8A6` | Main CTA, active state |
| `color.primary.400` | `#2DD4BF` | Hover / highlight |
| `color.primary.700` | `#0F766E` | Pressed / dense UI states |

## Neutrals (Dark Mode Default)

| Token | Hex | Usage |
|---|---:|---|
| `color.bg.canvas` | `#0F1012` | App background |
| `color.bg.surface` | `#17181B` | Cards, panels, sheets |
| `color.bg.elevated` | `#1F2024` | Elevated surfaces |
| `color.border.default` | `rgba(255,255,255,0.10)` | Subtle borders |
| `color.text.primary` | `#F5F5F5` | Main text |
| `color.text.secondary` | `#B3B3BB` | Supporting text |
| `color.text.muted` | `#8A8A94` | Hints / tertiary text |

## Neutrals (Light Mode)

| Token | Hex | Usage |
|---|---:|---|
| `color.bg.canvas` | `#F5F5F5` | App background |
| `color.bg.surface` | `#FFFFFF` | Cards, panels, sheets |
| `color.bg.elevated` | `#ECECEF` | Elevated surfaces |
| `color.border.default` | `rgba(20,20,23,0.10)` | Subtle borders |
| `color.text.primary` | `#141417` | Main text |
| `color.text.secondary` | `#52525B` | Supporting text |
| `color.text.muted` | `#71717A` | Hints / tertiary text |

## Supporting Semantic Colors

| Token | Hex | Usage |
|---|---:|---|
| `color.success` | `#22C55E` | Success |
| `color.warning` | `#F59E0B` | Warning |
| `color.error` | `#EF4444` | Error |
| `color.info` | `#8EA3FF` | Secondary route/partner state |

## Accent Usage Rules (Important)

- Use mint for primary actions and key interaction states.
- Keep most UI surfaces neutral (graphite/white/gray).
- Do not use bright accent colors as page backgrounds.
- Keep only one primary accent per screen when possible.
- Use `color.info` or neutral gray for secondary map/partner visuals.

## Android-Style Typography (Mobile-First)

These sizes are chosen to feel closer to Android app UI patterns while still working on web.

### Base Size Tokens

| Token | Value | Typical Use |
|---|---:|---|
| `text.xs` | `11px` | Tiny labels, helper tags |
| `text.sm` | `12px` | Secondary labels, captions |
| `text.base` | `14px` | Body text default |
| `text.lg` | `16px` | Buttons, stronger body |
| `text.xl` | `20px` | Section titles |
| `text.2xl` | `24px` | Screen headers |
| `text.3xl` | `32px` | Hero/large emphasis |

### Role-Based Guidance

- Label Small: `11px`
- Label Medium: `12px`
- Body Medium: `14px`
- Body Large: `16px`
- Title Medium: `16px`
- Title Large: `22px`
- Headline Small: `24px`
- Headline Medium: `28px`

## Spacing & Shape (Keep)

- Spacing: `4, 8, 12, 16, 20, 24, 32, 40, 48`
- Radius: `8, 12, 16, 20, pill`
- Touch targets:
  - Preferred minimum: `48px`
  - High-confidence tap targets: `56px`

## Theme Modes (Implementation Notes)

- Support both dark and light mode
- Respect OS preference by default
- Allow manual override later (`light` / `dark`)
- Keep the same accent color across both modes for consistent brand identity

## Documentation Sync Rule

When updating UI tokens in code:

1. Update this file first (or in the same change)
2. Update affected implementation tokens in frontend styles
3. Update any blueprint/readme references to avoid stale color guidance

