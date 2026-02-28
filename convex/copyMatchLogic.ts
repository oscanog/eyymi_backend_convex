export interface CopyMatchConfig {
  MIN_HOLD_MS: number;
  FOCUS_WINDOW_MS: number;
  MAX_PRESS_DURATION_MS: number;
  QUEUE_HEARTBEAT_MS: number;
  QUEUE_STALE_AFTER_MS: number;
  RING_PROGRESS_MS: number;
}

export const COPY_MATCH_CONFIG: CopyMatchConfig = {
  MIN_HOLD_MS: 1_500,
  FOCUS_WINDOW_MS: 3_000,
  MAX_PRESS_DURATION_MS: 6_000,
  QUEUE_HEARTBEAT_MS: 15_000,
  QUEUE_STALE_AFTER_MS: 45_000,
  RING_PROGRESS_MS: 1_500,
} as const;

export interface CopyFocusWindow {
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

export function getCopyFocusWindow(
  now: number,
  config: CopyMatchConfig = COPY_MATCH_CONFIG,
): CopyFocusWindow {
  const startsAt = Math.floor(now / config.FOCUS_WINDOW_MS) * config.FOCUS_WINDOW_MS;
  return {
    id: String(startsAt),
    startsAt,
    endsAt: startsAt + config.FOCUS_WINDOW_MS,
    durationMs: config.FOCUS_WINDOW_MS,
  };
}

export function sortCopyQueueEntries<T extends QueueLike>(entries: T[]) {
  return [...entries].sort(compareQueueEntries);
}

export function getCopyCandidateCycle<T extends QueueLike>(entries: T[], selfId: unknown) {
  return sortCopyQueueEntries(entries).filter((entry) => String(entry._id) !== String(selfId));
}

export function getCopyFocusTarget<T extends QueueLike>(
  entries: T[],
  selfId: unknown,
  now: number,
  config: CopyMatchConfig = COPY_MATCH_CONFIG,
): T | null {
  const candidateCycle = getCopyCandidateCycle(entries, selfId);
  if (candidateCycle.length === 0) {
    return null;
  }

  const windowIndex = Math.floor(now / config.FOCUS_WINDOW_MS);
  return candidateCycle[windowIndex % candidateCycle.length] ?? null;
}

export function clampPressEnd(
  start: number,
  end: number,
  maxDurationMs = COPY_MATCH_CONFIG.MAX_PRESS_DURATION_MS,
) {
  return Math.min(end, start + maxDurationMs);
}

export function getHoldProgress(
  now: number,
  startAt: number,
  minHoldMs = COPY_MATCH_CONFIG.MIN_HOLD_MS,
) {
  const progressMs = Math.max(0, now - startAt);
  return {
    progressMs,
    progressRatio: Math.min(1, progressMs / minHoldMs),
  };
}

export function canCommitHoldWithinWindow(
  pressStartedAt: number,
  windowEndsAt: number,
  minHoldMs = COPY_MATCH_CONFIG.MIN_HOLD_MS,
) {
  return pressStartedAt + minHoldMs <= windowEndsAt;
}

