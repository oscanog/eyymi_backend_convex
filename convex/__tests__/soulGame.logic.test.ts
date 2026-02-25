import { describe, expect, it } from "vitest";
import {
  SOUL_GAME_CONFIG,
  clampPressEnd,
  getOverlapMs,
  selectSoulGameMatchCandidate,
  shouldMatchPressIntervals,
} from "../soulGameLogic";

type QueueState = {
  id: string;
  isActive: boolean;
  hasActiveMatch: boolean;
};

type PressState = {
  id: string;
  queueEntryId: string;
  start: number;
  end?: number;
  durationMs?: number;
  status: "pending" | "matched" | "expired";
  matchId?: string;
  createdAt: number;
};

type MatchState = {
  id: string;
  userAQueueEntryId: string;
  userBQueueEntryId: string;
  overlapMs: number;
  status: "pending_intro" | "active_2min";
  conversationEndsAt: number;
};

type SessionState = {
  id: string;
  matchId: string;
  status: "active";
  endsAt: number;
};

function createSoulGameFlowHarness() {
  const queues = new Map<string, QueueState>();
  const presses: PressState[] = [];
  const matches: MatchState[] = [];
  const sessions: SessionState[] = [];
  let pressSeq = 0;
  let matchSeq = 0;
  let sessionSeq = 0;

  return {
    addQueue(id: string) {
      queues.set(id, { id, isActive: true, hasActiveMatch: false });
    },
    pressStart(queueEntryId: string, now: number) {
      const queue = queues.get(queueEntryId);
      if (!queue || !queue.isActive || queue.hasActiveMatch) {
        return { ok: false as const, reason: "queue_inactive" as const };
      }

      const existingPending = presses.find(
        (p) => p.queueEntryId === queueEntryId && p.status === "pending" && p.end === undefined,
      );
      if (existingPending) {
        return { ok: true as const, pressEventId: existingPending.id, reused: true as const };
      }

      const id = `press-${++pressSeq}`;
      presses.push({
        id,
        queueEntryId,
        start: now,
        status: "pending",
        createdAt: now,
      });
      return { ok: true as const, pressEventId: id, reused: false as const };
    },
    pressEnd(queueEntryId: string, pressEventId: string, now: number) {
      const press = presses.find((p) => p.id === pressEventId && p.queueEntryId === queueEntryId);
      const queue = queues.get(queueEntryId);
      if (!press || !queue) {
        return { ok: false as const, matched: false as const, reason: "missing_press" as const };
      }

      const endedAt = clampPressEnd(press.start, now);
      const durationMs = Math.max(0, endedAt - press.start);
      press.end = endedAt;
      press.durationMs = durationMs;
      press.status = durationMs >= SOUL_GAME_CONFIG.MIN_HOLD_MS ? "pending" : "expired";

      if (press.status === "expired") {
        return { ok: true as const, matched: false as const, reason: "min_hold" as const };
      }

      const selected = selectSoulGameMatchCandidate({
        currentQueueEntryId: queueEntryId,
        currentPressEventId: pressEventId,
        currentInterval: { start: press.start, end: endedAt },
        currentDurationMs: durationMs,
        candidates: presses
          .filter((p) => p.id !== pressEventId && p.status === "pending" && p.end !== undefined && p.durationMs !== undefined)
          .map((p) => {
            const candidateQueue = queues.get(p.queueEntryId);
            return {
              queueEntryId: p.queueEntryId,
              pressEventId: p.id,
              interval: { start: p.start, end: p.end! },
              durationMs: p.durationMs!,
              isQueueActive: Boolean(candidateQueue?.isActive),
              hasActiveMatch: Boolean(candidateQueue?.hasActiveMatch),
              isAlreadyMatchedPress: Boolean(p.matchId),
              createdAt: p.createdAt,
            };
          }),
      });

      if (!selected) {
        return { ok: true as const, matched: false as const, reason: "no_overlap" as const };
      }

      const partnerPress = presses.find((p) => p.id === selected.candidatePressEventId)!;
      const partnerQueue = queues.get(partnerPress.queueEntryId)!;

      const matchId = `match-${++matchSeq}`;
      const sessionId = `session-${++sessionSeq}`;
      const conversationEndsAt = now + SOUL_GAME_CONFIG.SESSION_DURATION_MS;

      press.status = "matched";
      press.matchId = matchId;
      partnerPress.status = "matched";
      partnerPress.matchId = matchId;
      queue.hasActiveMatch = true;
      partnerQueue.hasActiveMatch = true;

      matches.push({
        id: matchId,
        userAQueueEntryId: queueEntryId,
        userBQueueEntryId: partnerPress.queueEntryId,
        overlapMs: selected.overlap.overlapMs,
        status: "active_2min",
        conversationEndsAt,
      });
      sessions.push({
        id: sessionId,
        matchId,
        status: "active",
        endsAt: conversationEndsAt,
      });

      return {
        ok: true as const,
        matched: true as const,
        matchId,
        sessionId,
        overlapMs: selected.overlap.overlapMs,
      };
    },
    snapshot() {
      return {
        queues: [...queues.values()],
        presses: presses.map((p) => ({ ...p })),
        matches: matches.map((m) => ({ ...m })),
        sessions: sessions.map((s) => ({ ...s })),
      };
    },
  };
}

describe("soul game overlap logic", () => {
  it("clamps press end to max duration", () => {
    const start = 1_000;
    expect(clampPressEnd(start, start + 10_000, 6_000)).toBe(start + 6_000);
  });

  it("computes overlap in milliseconds", () => {
    expect(
      getOverlapMs(
        { start: 1_000, end: 2_000 },
        { start: 1_500, end: 2_400 },
      ),
    ).toBe(500);
  });

  it("matches when both holds are valid and overlap threshold is met", () => {
    const result = shouldMatchPressIntervals(
      { start: 1_000, end: 1_800 },
      { start: 1_300, end: 2_100 },
      {
        MIN_HOLD_MS: 600,
        MIN_OVERLAP_MS: 350,
        MAX_PRESS_DURATION_MS: 6000,
        QUEUE_STALE_AFTER_MS: 45_000,
        SESSION_DURATION_MS: 120_000,
        INTRO_DURATION_MS: 1_000,
      },
    );
    expect(result.matched).toBe(true);
    expect(result.overlap?.overlapMs).toBe(500);
  });

  it("rejects short holds even when overlap exists", () => {
    const result = shouldMatchPressIntervals(
      { start: 1_000, end: 1_400 },
      { start: 1_050, end: 1_800 },
    );
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("min_hold");
  });

  it("rejects when overlap is below threshold", () => {
    const result = shouldMatchPressIntervals(
      { start: 1_000, end: 1_800 },
      { start: 1_500, end: 2_100 },
      {
        MIN_HOLD_MS: 600,
        MIN_OVERLAP_MS: 400,
        MAX_PRESS_DURATION_MS: 6000,
        QUEUE_STALE_AFTER_MS: 45_000,
        SESSION_DURATION_MS: 120_000,
        INTRO_DURATION_MS: 1_000,
      },
    );
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("overlap");
  });

  it("selects a valid candidate for match creation flow", () => {
    const selected = selectSoulGameMatchCandidate({
      currentQueueEntryId: "queue-a",
      currentPressEventId: "press-a",
      currentInterval: { start: 10_000, end: 12_500 },
      currentDurationMs: 2_500,
      candidates: [
        {
          queueEntryId: "queue-b",
          pressEventId: "press-b",
          interval: { start: 10_300, end: 12_700 },
          durationMs: 2_400,
          isQueueActive: true,
          hasActiveMatch: false,
          createdAt: 10_300,
        },
      ],
    });

    expect(selected).not.toBeNull();
    expect(selected?.candidateQueueEntryId).toBe("queue-b");
    expect(selected?.overlap.overlapMs).toBe(2200);
  });

  it("skips stale/already-matched/invalid candidates and picks next eligible one", () => {
    const selected = selectSoulGameMatchCandidate({
      currentQueueEntryId: "queue-a",
      currentPressEventId: "press-a",
      currentInterval: { start: 10_000, end: 12_600 },
      currentDurationMs: 2_600,
      candidates: [
        {
          queueEntryId: "queue-stale",
          pressEventId: "press-stale",
          interval: { start: 10_200, end: 12_300 },
          durationMs: 2_100,
          isQueueActive: false,
          hasActiveMatch: false,
          createdAt: 10_500,
        },
        {
          queueEntryId: "queue-busy",
          pressEventId: "press-busy",
          interval: { start: 10_150, end: 12_650 },
          durationMs: 2_500,
          isQueueActive: true,
          hasActiveMatch: true,
          createdAt: 10_400,
        },
        {
          queueEntryId: "queue-good",
          pressEventId: "press-good",
          interval: { start: 10_250, end: 12_800 },
          durationMs: 2_550,
          isQueueActive: true,
          hasActiveMatch: false,
          createdAt: 10_300,
        },
      ],
    });

    expect(selected?.candidateQueueEntryId).toBe("queue-good");
    expect(selected?.candidatePressEventId).toBe("press-good");
  });

  it("prefers most recent eligible candidate when multiple are valid", () => {
    const selected = selectSoulGameMatchCandidate({
      currentQueueEntryId: "queue-a",
      currentPressEventId: "press-a",
      currentInterval: { start: 1_000, end: 3_500 },
      currentDurationMs: 2_500,
      candidates: [
        {
          queueEntryId: "queue-older",
          pressEventId: "press-older",
          interval: { start: 1_200, end: 3_600 },
          durationMs: 2_400,
          isQueueActive: true,
          hasActiveMatch: false,
          createdAt: 1_200,
        },
        {
          queueEntryId: "queue-newer",
          pressEventId: "press-newer",
          interval: { start: 1_300, end: 3_700 },
          durationMs: 2_400,
          isQueueActive: true,
          hasActiveMatch: false,
          createdAt: 1_300,
        },
      ],
    });

    expect(selected?.candidateQueueEntryId).toBe("queue-newer");
  });

  it("pressStart + pressEnd transitions create match and active session when second user ends with overlap", () => {
    const flow = createSoulGameFlowHarness();
    flow.addQueue("queue-a");
    flow.addQueue("queue-b");

    const aStart = flow.pressStart("queue-a", 10_000);
    const bStart = flow.pressStart("queue-b", 10_250);
    expect(aStart.ok && bStart.ok).toBe(true);

    const aEnd = flow.pressEnd("queue-a", aStart.ok ? aStart.pressEventId : "", 12_400);
    expect(aEnd.ok).toBe(true);
    expect(aEnd.matched).toBe(false);

    const bEnd = flow.pressEnd("queue-b", bStart.ok ? bStart.pressEventId : "", 12_500);
    expect(bEnd.ok).toBe(true);
    expect(bEnd.matched).toBe(true);
    expect(bEnd.overlapMs).toBeGreaterThanOrEqual(SOUL_GAME_CONFIG.MIN_OVERLAP_MS);

    const snapshot = flow.snapshot();
    expect(snapshot.matches).toHaveLength(1);
    expect(snapshot.matches[0]?.status).toBe("active_2min");
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]?.status).toBe("active");
    expect(snapshot.queues.every((q) => q.hasActiveMatch)).toBe(true);
    expect(snapshot.presses.filter((p) => p.status === "matched")).toHaveLength(2);
  });

  it("pressEnd does not create session when overlap is missing or hold is too short", () => {
    const flow = createSoulGameFlowHarness();
    flow.addQueue("queue-a");
    flow.addQueue("queue-b");

    const aStart = flow.pressStart("queue-a", 1_000);
    const bStart = flow.pressStart("queue-b", 2_000);
    expect(aStart.ok && bStart.ok).toBe(true);

    const shortEnd = flow.pressEnd("queue-a", aStart.ok ? aStart.pressEventId : "", 1_400);
    expect(shortEnd.ok).toBe(true);
    expect(shortEnd.matched).toBe(false);
    expect(shortEnd.reason).toBe("min_hold");

    const bEnd = flow.pressEnd("queue-b", bStart.ok ? bStart.pressEventId : "", 4_800);
    expect(bEnd.ok).toBe(true);
    expect(bEnd.matched).toBe(false);

    const snapshot = flow.snapshot();
    expect(snapshot.matches).toHaveLength(0);
    expect(snapshot.sessions).toHaveLength(0);
  });
});
