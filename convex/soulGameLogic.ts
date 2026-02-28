export interface SoulGameConfig {
  MIN_HOLD_MS: number;
  FOCUS_WINDOW_MS: number;
  MAX_PRESS_DURATION_MS: number;
  QUEUE_STALE_AFTER_MS: number;
  SESSION_DURATION_MS: number;
  INTRO_DURATION_MS: number;
}

export const SOUL_GAME_CONFIG: SoulGameConfig = {
  MIN_HOLD_MS: 1_500,
  FOCUS_WINDOW_MS: 3_000,
  MAX_PRESS_DURATION_MS: 6_000,
  QUEUE_STALE_AFTER_MS: 45_000,
  SESSION_DURATION_MS: 2 * 60 * 1000,
  INTRO_DURATION_MS: 1_000,
} as const;

export interface SoulGameFocusWindow {
  id: string;
  startsAt: number;
  endsAt: number;
  durationMs: number;
}

type QueueLike = {
  _id: unknown;
  joinedAt: number;
};

function compareQueueEntries(a: QueueLike, b: QueueLike) {
  if (a.joinedAt !== b.joinedAt) {
    return a.joinedAt - b.joinedAt;
  }
  return String(a._id).localeCompare(String(b._id));
}

export function getSoulGameFocusWindow(
  now: number,
  config: SoulGameConfig = SOUL_GAME_CONFIG,
): SoulGameFocusWindow {
  const startsAt = Math.floor(now / config.FOCUS_WINDOW_MS) * config.FOCUS_WINDOW_MS;
  return {
    id: String(startsAt),
    startsAt,
    endsAt: startsAt + config.FOCUS_WINDOW_MS,
    durationMs: config.FOCUS_WINDOW_MS,
  };
}

export function sortSoulGameQueueEntries<T extends QueueLike>(entries: T[]) {
  return [...entries].sort(compareQueueEntries);
}

export function getSoulGameCandidateCycle<T extends QueueLike>(
  entries: T[],
  selfId: unknown,
) {
  return sortSoulGameQueueEntries(entries).filter((entry) => String(entry._id) !== String(selfId));
}

export function getSoulGameFocusTarget<T extends QueueLike>(
  entries: T[],
  selfId: unknown,
  now: number,
  config: SoulGameConfig = SOUL_GAME_CONFIG,
): T | null {
  const candidateCycle = getSoulGameCandidateCycle(entries, selfId);
  if (candidateCycle.length === 0) {
    return null;
  }

  const windowIndex = Math.floor(now / config.FOCUS_WINDOW_MS);
  return candidateCycle[windowIndex % candidateCycle.length] ?? null;
}

export function clampPressEnd(
  start: number,
  end: number,
  maxDurationMs = SOUL_GAME_CONFIG.MAX_PRESS_DURATION_MS,
) {
  return Math.min(end, start + maxDurationMs);
}

export function getHoldProgress(now: number, startAt: number, minHoldMs = SOUL_GAME_CONFIG.MIN_HOLD_MS) {
  const progressMs = Math.max(0, now - startAt);
  return {
    progressMs,
    progressRatio: Math.min(1, progressMs / minHoldMs),
  };
}

export function canCommitHoldWithinWindow(
  pressStartedAt: number,
  windowEndsAt: number,
  minHoldMs = SOUL_GAME_CONFIG.MIN_HOLD_MS,
) {
  return pressStartedAt + minHoldMs <= windowEndsAt;
}
