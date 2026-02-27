export const COPY_MATCH_CONFIG = {
  MIN_HOLD_MS: 1600,
  MIN_OVERLAP_MS: 350,
  QUEUE_HEARTBEAT_MS: 15000,
  QUEUE_STALE_AFTER_MS: 45000,
  RING_PROGRESS_MS: 2200,
} as const;

export type CopyInterval = {
  start: number;
  end: number;
};

export function getIntervalOverlap(a: CopyInterval, b: CopyInterval): CopyInterval & { overlapMs: number } | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  const overlapMs = end - start;
  if (overlapMs <= 0) return null;
  return { start, end, overlapMs };
}

export function clampPressEnd(startedAt: number, now: number): number {
  const maxEnd = startedAt + COPY_MATCH_CONFIG.RING_PROGRESS_MS * 3;
  return Math.min(now, maxEnd);
}

