export interface SoulGameConfig {
  MIN_HOLD_MS: number;
  MIN_OVERLAP_MS: number;
  MAX_PRESS_DURATION_MS: number;
  QUEUE_STALE_AFTER_MS: number;
  SESSION_DURATION_MS: number;
  INTRO_DURATION_MS: number;
}

export const SOUL_GAME_CONFIG: SoulGameConfig = {
  MIN_HOLD_MS: 2000,
  MIN_OVERLAP_MS: 350,
  MAX_PRESS_DURATION_MS: 6000,
  QUEUE_STALE_AFTER_MS: 45_000,
  SESSION_DURATION_MS: 2 * 60 * 1000,
  INTRO_DURATION_MS: 1_000,
} as const;

export interface PressInterval {
  start: number;
  end: number;
}

export interface MatchCandidateInput {
  queueEntryId: string;
  pressEventId: string;
  interval: PressInterval;
  durationMs: number;
  isQueueActive: boolean;
  hasActiveMatch: boolean;
  isAlreadyMatchedPress?: boolean;
  createdAt?: number;
}

export function clampPressEnd(start: number, end: number, maxDurationMs = SOUL_GAME_CONFIG.MAX_PRESS_DURATION_MS) {
  return Math.min(end, start + maxDurationMs);
}

export function getPressDurationMs(interval: PressInterval) {
  return Math.max(0, interval.end - interval.start);
}

export function getOverlapMs(a: PressInterval, b: PressInterval) {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return Math.max(0, end - start);
}

export function getOverlapWindow(a: PressInterval, b: PressInterval) {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  if (end <= start) return null;
  return { start, end, overlapMs: end - start };
}

export function shouldMatchPressIntervals(
  a: PressInterval,
  b: PressInterval,
  config: SoulGameConfig = SOUL_GAME_CONFIG,
) {
  const durationA = getPressDurationMs(a);
  const durationB = getPressDurationMs(b);

  if (durationA < config.MIN_HOLD_MS || durationB < config.MIN_HOLD_MS) {
    return { matched: false as const, reason: "min_hold" as const, overlap: null };
  }

  const overlap = getOverlapWindow(a, b);
  if (!overlap || overlap.overlapMs < config.MIN_OVERLAP_MS) {
    return { matched: false as const, reason: "overlap" as const, overlap: null };
  }

  return { matched: true as const, reason: "ok" as const, overlap };
}

export function selectSoulGameMatchCandidate(params: {
  currentQueueEntryId: string;
  currentPressEventId: string;
  currentInterval: PressInterval;
  currentDurationMs: number;
  candidates: MatchCandidateInput[];
  config?: SoulGameConfig;
}) {
  const config = params.config ?? SOUL_GAME_CONFIG;

  if (params.currentDurationMs < config.MIN_HOLD_MS) {
    return null;
  }

  const sorted = [...params.candidates].sort((a, b) => {
    const aTime = a.createdAt ?? a.interval.start;
    const bTime = b.createdAt ?? b.interval.start;
    return bTime - aTime;
  });

  for (const candidate of sorted) {
    if (candidate.queueEntryId === params.currentQueueEntryId) continue;
    if (candidate.pressEventId === params.currentPressEventId) continue;
    if (!candidate.isQueueActive || candidate.hasActiveMatch) continue;
    if (candidate.isAlreadyMatchedPress) continue;
    if (candidate.durationMs < config.MIN_HOLD_MS) continue;

    const decision = shouldMatchPressIntervals(params.currentInterval, candidate.interval, config);
    if (!decision.matched || !decision.overlap) continue;

    return {
      candidateQueueEntryId: candidate.queueEntryId,
      candidatePressEventId: candidate.pressEventId,
      overlap: decision.overlap,
    };
  }

  return null;
}
