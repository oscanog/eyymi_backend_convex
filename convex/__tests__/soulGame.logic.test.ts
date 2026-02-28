import { describe, expect, it } from "vitest";
import {
  SOUL_GAME_CONFIG,
  canCommitHoldWithinWindow,
  getSoulGameFocusTarget,
  getSoulGameFocusWindow,
} from "../soulGameLogic";

type QueueState = {
  id: string;
  joinedAt: number;
  isActive: boolean;
  activeMatchId?: string;
  queueStatus: "queued" | "matching" | "matched";
};

type PressState = {
  id: string;
  queueEntryId: string;
  targetQueueEntryId: string;
  focusWindowId: string;
  pressStartedAt: number;
  readyAt?: number;
  status: "holding" | "ready" | "matched" | "expired" | "cancelled";
};

type MatchState = {
  id: string;
  userAQueueEntryId: string;
  userBQueueEntryId: string;
  windowId: string;
  status: "pending_intro" | "ended";
};

function createHarness() {
  const queues = new Map<string, QueueState>();
  const presses = new Map<string, PressState>();
  const matches = new Map<string, MatchState>();
  let pressSeq = 0;
  let matchSeq = 0;

  const getActiveQueues = () =>
    [...queues.values()]
      .filter((queue) => queue.isActive && !queue.activeMatchId)
      .map((queue) => ({ _id: queue.id, joinedAt: queue.joinedAt }));

  const getFocusTarget = (queueEntryId: string, now: number) =>
    getSoulGameFocusTarget(getActiveQueues(), queueEntryId, now)?._id ?? null;

  const getCurrentMatch = (queueEntryId: string) =>
    [...matches.values()].find(
      (match) =>
        match.status === "pending_intro" &&
        (match.userAQueueEntryId === queueEntryId || match.userBQueueEntryId === queueEntryId),
    ) ?? null;

  return {
    addQueue(id: string, joinedAt: number) {
      queues.set(id, {
        id,
        joinedAt,
        isActive: true,
        queueStatus: "queued",
      });
    },
    getFocusTarget,
    getPartnerHoldVisible(queueEntryId: string, now: number) {
      const focusWindow = getSoulGameFocusWindow(now);
      const target = getFocusTarget(queueEntryId, now);
      if (!target) return false;
      if (getFocusTarget(target, now) !== queueEntryId) return false;

      return [...presses.values()].some(
        (press) =>
          press.queueEntryId === target &&
          press.targetQueueEntryId === queueEntryId &&
          press.focusWindowId === focusWindow.id &&
          (press.status === "holding" || press.status === "ready"),
      );
    },
    pressStart(queueEntryId: string, now: number) {
      const targetQueueEntryId = getFocusTarget(queueEntryId, now);
      if (!targetQueueEntryId) {
        return { ok: false as const, reason: "no_target" as const };
      }

      const focusWindow = getSoulGameFocusWindow(now);
      const existing = [...presses.values()].find(
        (press) =>
          press.queueEntryId === queueEntryId &&
          press.targetQueueEntryId === targetQueueEntryId &&
          press.focusWindowId === focusWindow.id &&
          (press.status === "holding" || press.status === "ready"),
      );
      if (existing) {
        return { ok: true as const, pressEventId: existing.id, targetQueueEntryId, focusWindowId: focusWindow.id };
      }

      const id = `press-${++pressSeq}`;
      presses.set(id, {
        id,
        queueEntryId,
        targetQueueEntryId,
        focusWindowId: focusWindow.id,
        pressStartedAt: now,
        status: "holding",
      });
      const queue = queues.get(queueEntryId)!;
      queue.queueStatus = "matching";
      return { ok: true as const, pressEventId: id, targetQueueEntryId, focusWindowId: focusWindow.id };
    },
    pressCommit(queueEntryId: string, pressEventId: string, now: number) {
      const press = presses.get(pressEventId);
      if (!press || press.queueEntryId !== queueEntryId) {
        return { ok: false as const, matched: false as const, reason: "missing_press" as const };
      }

      const focusWindow = getSoulGameFocusWindow(now);
      if (focusWindow.id !== press.focusWindowId) {
        press.status = "expired";
        return { ok: true as const, matched: false as const, reason: "focus_window_moved" as const };
      }

      if (!canCommitHoldWithinWindow(press.pressStartedAt, focusWindow.endsAt)) {
        press.status = "expired";
        return { ok: true as const, matched: false as const, reason: "window_expired" as const };
      }

      press.status = "ready";
      press.readyAt = press.pressStartedAt + SOUL_GAME_CONFIG.MIN_HOLD_MS;

      const reciprocal = [...presses.values()].find(
        (candidate) =>
          candidate.queueEntryId === press.targetQueueEntryId &&
          candidate.targetQueueEntryId === queueEntryId &&
          candidate.focusWindowId === press.focusWindowId &&
          candidate.status === "ready",
      );

      if (!reciprocal) {
        return { ok: true as const, matched: false as const, reason: "waiting_reciprocal" as const };
      }

      const matchId = `match-${++matchSeq}`;
      matches.set(matchId, {
        id: matchId,
        userAQueueEntryId: queueEntryId,
        userBQueueEntryId: press.targetQueueEntryId,
        windowId: press.focusWindowId,
        status: "pending_intro",
      });

      press.status = "matched";
      reciprocal.status = "matched";
      const queue = queues.get(queueEntryId)!;
      const partner = queues.get(press.targetQueueEntryId)!;
      queue.activeMatchId = matchId;
      partner.activeMatchId = matchId;
      queue.queueStatus = "matched";
      partner.queueStatus = "matched";

      return { ok: true as const, matched: true as const, matchId };
    },
    pressCancel(queueEntryId: string, pressEventId: string) {
      const press = presses.get(pressEventId);
      if (!press || press.queueEntryId !== queueEntryId) {
        return { ok: false as const };
      }
      if (press.status === "ready" || press.status === "matched") {
        return { ok: true as const, preserved: true as const };
      }
      press.status = "cancelled";
      const queue = queues.get(queueEntryId)!;
      queue.queueStatus = "queued";
      return { ok: true as const, preserved: false as const };
    },
    closeDemoMatch(queueEntryId: string) {
      const match = getCurrentMatch(queueEntryId);
      if (!match) return { ok: false as const };
      match.status = "ended";

      const queueA = queues.get(match.userAQueueEntryId)!;
      const queueB = queues.get(match.userBQueueEntryId)!;
      queueA.activeMatchId = undefined;
      queueB.activeMatchId = undefined;
      queueA.queueStatus = "queued";
      queueB.queueStatus = "queued";

      for (const press of presses.values()) {
        if (press.focusWindowId === match.windowId && (press.status === "holding" || press.status === "ready")) {
          press.status = "cancelled";
        }
      }

      return { ok: true as const };
    },
    snapshot() {
      return {
        queues: [...queues.values()].map((queue) => ({ ...queue })),
        presses: [...presses.values()].map((press) => ({ ...press })),
        matches: [...matches.values()].map((match) => ({ ...match })),
      };
    },
  };
}

describe("soul game center-target reciprocal matching", () => {
  it("computes a stable focus target within the same 3-second window", () => {
    const queues = [
      { _id: "queue-a", joinedAt: 1000 },
      { _id: "queue-b", joinedAt: 2000 },
      { _id: "queue-c", joinedAt: 3000 },
    ];

    const firstWindowTarget = getSoulGameFocusTarget(queues, "queue-a", 6_100);
    const sameWindowTarget = getSoulGameFocusTarget(queues, "queue-a", 8_900);
    const nextWindowTarget = getSoulGameFocusTarget(queues, "queue-a", 9_100);

    expect(firstWindowTarget?._id).toBe(sameWindowTarget?._id);
    expect(nextWindowTarget?._id).not.toBe(firstWindowTarget?._id);
  });

  it("does not match when only one user reaches ready-state", () => {
    const flow = createHarness();
    flow.addQueue("queue-a", 1_000);
    flow.addQueue("queue-b", 2_000);

    const started = flow.pressStart("queue-a", 6_100);
    expect(started.ok).toBe(true);

    const committed = flow.pressCommit("queue-a", started.ok ? started.pressEventId : "", 7_650);
    expect(committed.ok).toBe(true);
    expect(committed.matched).toBe(false);

    const snapshot = flow.snapshot();
    expect(snapshot.matches).toHaveLength(0);
    expect(snapshot.presses[0]?.status).toBe("ready");
  });

  it("shows reciprocal hold visibility only when the target also points back", () => {
    const flow = createHarness();
    flow.addQueue("queue-a", 1_000);
    flow.addQueue("queue-b", 2_000);
    flow.addQueue("queue-c", 3_000);
    flow.addQueue("queue-d", 4_000);

    const aStart = flow.pressStart("queue-a", 6_100);
    const cStart = flow.pressStart("queue-c", 6_100);
    expect(aStart.ok && cStart.ok).toBe(true);
    expect(flow.getPartnerHoldVisible("queue-a", 6_500)).toBe(false);
  });

  it("matches only when both users commit in the same focus window", () => {
    const flow = createHarness();
    flow.addQueue("queue-a", 1_000);
    flow.addQueue("queue-b", 2_000);

    const aStart = flow.pressStart("queue-a", 6_100);
    const bStart = flow.pressStart("queue-b", 6_100);

    const aCommit = flow.pressCommit("queue-a", aStart.ok ? aStart.pressEventId : "", 7_650);
    const bCommit = flow.pressCommit("queue-b", bStart.ok ? bStart.pressEventId : "", 8_200);

    expect(aCommit.matched).toBe(false);
    expect(bCommit.matched).toBe(true);

    const snapshot = flow.snapshot();
    expect(snapshot.matches).toHaveLength(1);
    expect(snapshot.matches[0]?.status).toBe("pending_intro");
    expect(snapshot.queues.every((queue) => queue.queueStatus === "matched")).toBe(true);
  });

  it("cancels early release before 1.5 seconds and keeps early committed users latched", () => {
    const flow = createHarness();
    flow.addQueue("queue-a", 1_000);
    flow.addQueue("queue-b", 2_000);

    const cancelStart = flow.pressStart("queue-a", 6_100);
    const cancelResult = flow.pressCancel("queue-a", cancelStart.ok ? cancelStart.pressEventId : "");
    expect(cancelResult.ok).toBe(true);
    expect(cancelResult.preserved).toBe(false);

    const readyStart = flow.pressStart("queue-a", 6_250);
    const readyCommit = flow.pressCommit("queue-a", readyStart.ok ? readyStart.pressEventId : "", 7_800);
    expect(readyCommit.matched).toBe(false);

    const releaseAfterReady = flow.pressCancel("queue-a", readyStart.ok ? readyStart.pressEventId : "");
    expect(releaseAfterReady.preserved).toBe(true);

    const snapshot = flow.snapshot();
    expect(snapshot.presses.find((press) => press.id === readyStart.pressEventId)?.status).toBe("ready");
  });

  it("invalidates an unused ready-state after the window rotates", () => {
    const flow = createHarness();
    flow.addQueue("queue-a", 1_000);
    flow.addQueue("queue-b", 2_000);

    const started = flow.pressStart("queue-a", 6_100);
    const committed = flow.pressCommit("queue-a", started.ok ? started.pressEventId : "", 7_650);
    expect(committed.matched).toBe(false);

    const nextWindowResult = flow.pressCommit("queue-a", started.ok ? started.pressEventId : "", 9_100);
    expect(nextWindowResult.reason).toBe("focus_window_moved");
  });

  it("closeDemoMatch resets both users back to the carousel", () => {
    const flow = createHarness();
    flow.addQueue("queue-a", 1_000);
    flow.addQueue("queue-b", 2_000);

    const aStart = flow.pressStart("queue-a", 6_100);
    const bStart = flow.pressStart("queue-b", 6_100);
    flow.pressCommit("queue-a", aStart.ok ? aStart.pressEventId : "", 7_650);
    flow.pressCommit("queue-b", bStart.ok ? bStart.pressEventId : "", 8_200);

    const closed = flow.closeDemoMatch("queue-a");
    expect(closed.ok).toBe(true);

    const snapshot = flow.snapshot();
    expect(snapshot.matches[0]?.status).toBe("ended");
    expect(snapshot.queues.every((queue) => queue.queueStatus === "queued" && !queue.activeMatchId)).toBe(true);
  });

  it("allows a 1.5 second hold to complete within a 3 second window", () => {
    const focusWindow = getSoulGameFocusWindow(6_100);
    expect(canCommitHoldWithinWindow(focusWindow.startsAt + 500, focusWindow.endsAt)).toBe(true);
    expect(canCommitHoldWithinWindow(focusWindow.startsAt + 1_700, focusWindow.endsAt)).toBe(false);
  });
});
