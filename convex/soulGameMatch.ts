import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  SOUL_GAME_CONFIG,
  canCommitHoldWithinWindow,
  clampPressEnd,
  getHoldProgress,
  getSoulGameFocusTarget,
  getSoulGameFocusWindow,
  sortSoulGameQueueEntries,
} from "./soulGameLogic";

function isQueueEntryActive(entry: Doc<"soulGameQueue">, now: number) {
  return entry.isActive && entry.lastHeartbeatAt >= now - SOUL_GAME_CONFIG.QUEUE_STALE_AFTER_MS;
}

function sanitizeQueueView(queue: Doc<"soulGameQueue"> | null) {
  if (!queue) return null;
  return {
    queueEntryId: queue._id,
    authUserId: queue.authUserId ?? null,
    profileUserId: queue.profileUserId ?? null,
    username: queue.username ?? null,
    avatarId: queue.avatarId ?? null,
    isActive: queue.isActive,
    joinedAt: queue.joinedAt,
    lastHeartbeatAt: queue.lastHeartbeatAt,
  };
}

async function getActiveQueueEntries(ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">, now: number) {
  const activeEntries = await ctx.db
    .query("soulGameQueue")
    .withIndex("by_isActive_lastHeartbeatAt", (q) => q.eq("isActive", true))
    .collect();

  return sortSoulGameQueueEntries(activeEntries.filter((entry) => isQueueEntryActive(entry, now)));
}

async function getLatestPressByStatuses(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  queueEntryId: Id<"soulGameQueue">,
  statuses: Array<"holding" | "ready" | "matched" | "expired" | "cancelled">,
) {
  const rows = await Promise.all(
    statuses.map((status) =>
      ctx.db
        .query("soulGamePressEvents")
        .withIndex("by_queueEntry_status", (q: any) => q.eq("queueEntryId", queueEntryId).eq("status", status))
        .collect(),
    ),
  );

  return rows
    .flat()
    .sort((a: Doc<"soulGamePressEvents">, b: Doc<"soulGamePressEvents">) => b.createdAt - a.createdAt)[0] ?? null;
}

async function expireWindowPressesForQueueEntry(
  ctx: Pick<MutationCtx, "db">,
  queueEntryId: Id<"soulGameQueue">,
  focusWindowId: string,
  preservePressId?: Id<"soulGamePressEvents">,
) {
  const rows = await Promise.all([
    ctx.db
      .query("soulGamePressEvents")
      .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", queueEntryId).eq("status", "holding"))
      .collect(),
    ctx.db
      .query("soulGamePressEvents")
      .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", queueEntryId).eq("status", "ready"))
      .collect(),
  ]);

  const now = Date.now();
  for (const press of rows.flat()) {
    if (preservePressId && press._id === preservePressId) continue;
    if (press.focusWindowId === focusWindowId) continue;
    await ctx.db.patch(press._id, {
      status: "expired",
      pressEndedAt: press.pressEndedAt ?? now,
      durationMs: press.durationMs ?? Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
    });
  }
}

function findOpenMatchIdForQueue(queue: Doc<"soulGameQueue"> | null) {
  return queue?.activeMatchId ?? null;
}

async function getMatchById(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  matchId: Id<"soulGameMatches"> | null,
) {
  if (!matchId) return null;
  const match = await ctx.db.get(matchId);
  if (!match || match.status !== "pending_intro") {
    return null;
  }
  return match;
}

async function getExistingPairMatch(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  queueEntryId: Id<"soulGameQueue">,
  targetQueueEntryId: Id<"soulGameQueue">,
  focusWindowId: string,
) {
  const matchesA = await ctx.db
    .query("soulGameMatches")
    .withIndex("by_userAQueueEntryId", (q: any) => q.eq("userAQueueEntryId", queueEntryId))
    .collect();
  const matchesB = await ctx.db
    .query("soulGameMatches")
    .withIndex("by_userBQueueEntryId", (q: any) => q.eq("userBQueueEntryId", queueEntryId))
    .collect();

  return [...matchesA, ...matchesB].find((match) => {
    if (match.status !== "pending_intro") return false;
    const isPair =
      (match.userAQueueEntryId === queueEntryId && match.userBQueueEntryId === targetQueueEntryId) ||
      (match.userAQueueEntryId === targetQueueEntryId && match.userBQueueEntryId === queueEntryId);
    return isPair && String(match.matchWindowStart) === focusWindowId;
  }) ?? null;
}

function buildFocusState(
  entries: Doc<"soulGameQueue">[],
  selfQueueId: Id<"soulGameQueue">,
  now: number,
) {
  const availableEntries = entries.filter((entry) => !entry.activeMatchId);
  const focusWindow = getSoulGameFocusWindow(now);
  const focusTarget = getSoulGameFocusTarget(availableEntries, selfQueueId, now);
  return { focusWindow, focusTarget, availableEntries };
}

async function buildHoldView(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  queueEntryId: Id<"soulGameQueue">,
  focusWindowId: string,
  now: number,
) {
  const current = await getLatestPressByStatuses(ctx, queueEntryId, ["holding", "ready"]);
  if (!current || current.focusWindowId !== focusWindowId) {
    return null;
  }

  const effectiveNow = current.readyAt ?? now;
  const progress = current.readyAt
    ? { progressMs: SOUL_GAME_CONFIG.MIN_HOLD_MS, progressRatio: 1 }
    : getHoldProgress(Math.min(effectiveNow, now), current.pressStartedAt);

  return {
    pressEventId: current._id,
    progressMs: progress.progressMs,
    progressRatio: progress.progressRatio,
    isReady: current.status === "ready" || current.status === "matched",
    targetQueueEntryId: current.targetQueueEntryId,
  };
}

async function createDemoMatchIfReady(params: {
  ctx: MutationCtx;
  now: number;
  queue: Doc<"soulGameQueue">;
  targetQueue: Doc<"soulGameQueue">;
  selfPress: Doc<"soulGamePressEvents">;
  partnerPress: Doc<"soulGamePressEvents">;
  focusWindowId: string;
  focusWindowStartsAt: number;
  focusWindowEndsAt: number;
}) {
  const { ctx, now, queue, targetQueue, selfPress, partnerPress, focusWindowId, focusWindowStartsAt, focusWindowEndsAt } = params;

  const existingPairMatch = await getExistingPairMatch(ctx, queue._id, targetQueue._id, focusWindowId);
  if (existingPairMatch) {
    return existingPairMatch;
  }

  const matchId = await ctx.db.insert("soulGameMatches", {
    userAQueueEntryId: queue._id,
    userBQueueEntryId: targetQueue._id,
    userAPressEventId: selfPress._id,
    userBPressEventId: partnerPress._id,
    matchWindowStart: focusWindowStartsAt,
    matchWindowEnd: focusWindowEndsAt,
    overlapMs: 0,
    createdAt: now,
    status: "pending_intro",
  });

  await ctx.db.patch(selfPress._id, { status: "matched", matchId });
  await ctx.db.patch(partnerPress._id, { status: "matched", matchId });

  await ctx.db.patch(queue._id, {
    activeMatchId: matchId,
    queueStatus: "matched",
    lastHeartbeatAt: now,
  });
  await ctx.db.patch(targetQueue._id, {
    activeMatchId: matchId,
    queueStatus: "matched",
    lastHeartbeatAt: now,
  });

  return await ctx.db.get(matchId);
}

export const pressStart = mutation({
  args: {
    queueEntryId: v.id("soulGameQueue"),
    targetQueueEntryId: v.id("soulGameQueue"),
    focusWindowId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    if (!queue || !isQueueEntryActive(queue, now)) {
      return { ok: false as const, reason: "queue_inactive" as const, serverNow: now };
    }
    if (queue.activeMatchId) {
      return { ok: false as const, reason: "already_matched" as const, serverNow: now };
    }

    const activeEntries = await getActiveQueueEntries(ctx, now);
    const { focusWindow, focusTarget } = buildFocusState(activeEntries, queue._id, now);
    if (focusWindow.id !== args.focusWindowId) {
      return { ok: false as const, reason: "focus_window_moved" as const, serverNow: now, focusWindow };
    }
    if (!focusTarget || focusTarget._id !== args.targetQueueEntryId) {
      return { ok: false as const, reason: "invalid_target" as const, serverNow: now, focusWindow };
    }

    await expireWindowPressesForQueueEntry(ctx, queue._id, focusWindow.id);

    const current = await getLatestPressByStatuses(ctx, args.queueEntryId, ["holding", "ready"]);
    if (
      current &&
      current.focusWindowId === focusWindow.id &&
      current.targetQueueEntryId === args.targetQueueEntryId
    ) {
      return {
        ok: true as const,
        pressEventId: current._id,
        reused: true as const,
        isReady: current.status === "ready" || current.status === "matched",
        serverNow: now,
        focusWindow,
      };
    }

    const pressEventId = await ctx.db.insert("soulGamePressEvents", {
      queueEntryId: args.queueEntryId,
      participantKey: queue.participantKey,
      targetQueueEntryId: args.targetQueueEntryId,
      focusWindowId: focusWindow.id,
      pressStartedAt: now,
      status: "holding",
      createdAt: now,
    });

    await ctx.db.patch(queue._id, {
      queueStatus: "matching",
      lastPressAt: now,
      lastHeartbeatAt: now,
    });

    return {
      ok: true as const,
      pressEventId,
      reused: false as const,
      isReady: false as const,
      serverNow: now,
      focusWindow,
    };
  },
});

export const pressCommit = mutation({
  args: {
    queueEntryId: v.id("soulGameQueue"),
    pressEventId: v.id("soulGamePressEvents"),
    targetQueueEntryId: v.id("soulGameQueue"),
    focusWindowId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    const press = await ctx.db.get(args.pressEventId);

    if (!queue || !press || press.queueEntryId !== args.queueEntryId) {
      return { ok: false as const, reason: "missing_press" as const, matched: false as const, serverNow: now };
    }
    if (!isQueueEntryActive(queue, now)) {
      return { ok: false as const, reason: "queue_inactive" as const, matched: false as const, serverNow: now };
    }
    if (queue.activeMatchId) {
      return { ok: true as const, matched: true as const, matchId: queue.activeMatchId, serverNow: now };
    }

    const activeEntries = await getActiveQueueEntries(ctx, now);
    const { focusWindow, focusTarget } = buildFocusState(activeEntries, queue._id, now);
    if (focusWindow.id !== args.focusWindowId || press.focusWindowId !== args.focusWindowId) {
      await ctx.db.patch(press._id, {
        status: "expired",
        pressEndedAt: now,
        durationMs: Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
      });
      return { ok: false as const, reason: "focus_window_moved" as const, matched: false as const, serverNow: now };
    }
    if (!focusTarget || focusTarget._id !== args.targetQueueEntryId || press.targetQueueEntryId !== args.targetQueueEntryId) {
      return { ok: false as const, reason: "invalid_target" as const, matched: false as const, serverNow: now };
    }
    if (press.status !== "holding" && press.status !== "ready") {
      return { ok: false as const, reason: "press_not_holding" as const, matched: false as const, serverNow: now };
    }
    if (!canCommitHoldWithinWindow(press.pressStartedAt, focusWindow.endsAt)) {
      await ctx.db.patch(press._id, {
        status: "expired",
        pressEndedAt: now,
        durationMs: Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
      });
      await ctx.db.patch(queue._id, {
        queueStatus: "queued",
        lastHeartbeatAt: now,
      });
      return { ok: true as const, matched: false as const, reason: "window_expired" as const, serverNow: now };
    }

    const readyAt = press.readyAt ?? Math.min(now, focusWindow.endsAt, press.pressStartedAt + SOUL_GAME_CONFIG.MIN_HOLD_MS);
    const durationMs = Math.max(0, readyAt - press.pressStartedAt);

    if (durationMs < SOUL_GAME_CONFIG.MIN_HOLD_MS) {
      return { ok: true as const, matched: false as const, reason: "min_hold" as const, durationMs, serverNow: now };
    }

    await ctx.db.patch(press._id, {
      status: "ready",
      readyAt,
      pressEndedAt: readyAt,
      durationMs,
    });

    await ctx.db.patch(queue._id, {
      queueStatus: "matching",
      lastHeartbeatAt: now,
      lastPressAt: readyAt,
    });

    const targetQueue = await ctx.db.get(args.targetQueueEntryId);
    if (!targetQueue || !isQueueEntryActive(targetQueue, now) || targetQueue.activeMatchId) {
      return { ok: true as const, matched: false as const, reason: "waiting_reciprocal" as const, serverNow: now };
    }

    const targetFocusTarget = getSoulGameFocusTarget(activeEntries.filter((entry) => !entry.activeMatchId), targetQueue._id, now);
    if (!targetFocusTarget || targetFocusTarget._id !== args.queueEntryId) {
      return { ok: true as const, matched: false as const, reason: "waiting_reciprocal" as const, serverNow: now };
    }

    const reciprocalReadyPresses = await ctx.db
      .query("soulGamePressEvents")
      .withIndex("by_target_status", (q) => q.eq("targetQueueEntryId", args.queueEntryId).eq("status", "ready"))
      .collect();

    const partnerPress = reciprocalReadyPresses
      .filter(
        (candidate) =>
          candidate.queueEntryId === args.targetQueueEntryId &&
          candidate.focusWindowId === args.focusWindowId &&
          candidate.targetQueueEntryId === args.queueEntryId,
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

    if (!partnerPress) {
      return { ok: true as const, matched: false as const, reason: "waiting_reciprocal" as const, serverNow: now };
    }

    const match = await createDemoMatchIfReady({
      ctx,
      now,
      queue,
      targetQueue,
      selfPress: { ...press, status: "ready", readyAt, pressEndedAt: readyAt, durationMs },
      partnerPress,
      focusWindowId: args.focusWindowId,
      focusWindowStartsAt: focusWindow.startsAt,
      focusWindowEndsAt: focusWindow.endsAt,
    });

    return {
      ok: true as const,
      matched: true as const,
      matchId: match?._id ?? null,
      serverNow: now,
    };
  },
});

export const pressCancel = mutation({
  args: {
    queueEntryId: v.id("soulGameQueue"),
    pressEventId: v.id("soulGamePressEvents"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    const press = await ctx.db.get(args.pressEventId);

    if (!queue || !press || press.queueEntryId !== args.queueEntryId) {
      return { ok: false as const, reason: "missing_press" as const, serverNow: now };
    }

    if (press.status === "ready" || press.status === "matched") {
      return { ok: true as const, preserved: true as const, serverNow: now };
    }

    if (press.status !== "holding") {
      return { ok: true as const, preserved: false as const, serverNow: now };
    }

    await ctx.db.patch(press._id, {
      status: "cancelled",
      pressEndedAt: now,
      durationMs: Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
    });
    await ctx.db.patch(queue._id, {
      queueStatus: queue.activeMatchId ? "matched" : "queued",
      lastHeartbeatAt: now,
    });

    return { ok: true as const, preserved: false as const, serverNow: now };
  },
});

export const closeDemoMatch = mutation({
  args: {
    queueEntryId: v.id("soulGameQueue"),
    matchId: v.id("soulGameMatches"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      return { ok: false as const, reason: "match_missing" as const, serverNow: now };
    }

    const isParticipant =
      match.userAQueueEntryId === args.queueEntryId || match.userBQueueEntryId === args.queueEntryId;
    if (!isParticipant) {
      return { ok: false as const, reason: "access_denied" as const, serverNow: now };
    }

    await ctx.db.patch(match._id, { status: "ended" });

    const participantQueueIds = [match.userAQueueEntryId, match.userBQueueEntryId];
    for (const queueEntryId of participantQueueIds) {
      const queue = await ctx.db.get(queueEntryId);
      if (!queue) continue;
      await ctx.db.patch(queueEntryId, {
        activeMatchId: undefined,
        queueStatus: queue.isActive ? "queued" : queue.queueStatus,
        lastHeartbeatAt: now,
      });
    }

    const focusWindowId = String(match.matchWindowStart);
    const matchWindowPresses = await ctx.db
      .query("soulGamePressEvents")
      .withIndex("by_focusWindowId_status", (q) => q.eq("focusWindowId", focusWindowId).eq("status", "holding"))
      .collect();
    const readyWindowPresses = await ctx.db
      .query("soulGamePressEvents")
      .withIndex("by_focusWindowId_status", (q) => q.eq("focusWindowId", focusWindowId).eq("status", "ready"))
      .collect();

    for (const press of [...matchWindowPresses, ...readyWindowPresses]) {
      if (
        press.queueEntryId !== match.userAQueueEntryId &&
        press.queueEntryId !== match.userBQueueEntryId
      ) {
        continue;
      }

      await ctx.db.patch(press._id, {
        status: "cancelled",
        pressEndedAt: press.pressEndedAt ?? now,
        durationMs: press.durationMs ?? Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
      });
    }

    return { ok: true as const, serverNow: now };
  },
});

export const getClientState = query({
  args: { queueEntryId: v.optional(v.id("soulGameQueue")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let queue = args.queueEntryId ? await ctx.db.get(args.queueEntryId) : null;
    if (queue && !isQueueEntryActive(queue, now)) {
      queue = null;
    }

    const activeEntries = await getActiveQueueEntries(ctx, now);
    const availableEntries = activeEntries.filter((entry) => !entry.activeMatchId);
    const candidates = availableEntries
      .filter((entry) => !queue || entry._id !== queue._id)
      .slice(0, 12)
      .map((entry) => ({
        queueEntryId: entry._id,
        username: entry.username ?? null,
        avatarId: entry.avatarId ?? null,
        joinedAt: entry.joinedAt,
        lastHeartbeatAt: entry.lastHeartbeatAt,
      }));

    const focusWindow = queue ? getSoulGameFocusWindow(now) : null;
    const focusTarget = queue
      ? getSoulGameFocusTarget(availableEntries, queue._id, now)
      : null;

    const selfHold = queue && focusWindow
      ? await buildHoldView(ctx, queue._id, focusWindow.id, now)
      : null;

    let partnerReciprocalHold: {
      queueEntryId: Id<"soulGameQueue">;
      progressMs: number;
      progressRatio: number;
      isReady: boolean;
      isVisible: boolean;
    } | null = null;

    if (queue && focusWindow && focusTarget) {
      const partnerFocusTarget = getSoulGameFocusTarget(availableEntries, focusTarget._id, now);
      if (partnerFocusTarget && partnerFocusTarget._id === queue._id) {
        const partnerHold = await buildHoldView(ctx, focusTarget._id, focusWindow.id, now);
        partnerReciprocalHold = partnerHold
          ? {
              queueEntryId: focusTarget._id,
              progressMs: partnerHold.progressMs,
              progressRatio: partnerHold.progressRatio,
              isReady: partnerHold.isReady,
              isVisible: partnerHold.targetQueueEntryId === queue._id,
            }
          : {
              queueEntryId: focusTarget._id,
              progressMs: 0,
              progressRatio: 0,
              isReady: false,
              isVisible: false,
            };
      }
    }

    const activeMatch = queue ? await getMatchById(ctx, findOpenMatchIdForQueue(queue)) : null;
    let matchedUser: Doc<"soulGameQueue"> | null = null;
    if (activeMatch && queue) {
      const partnerQueueId =
        activeMatch.userAQueueEntryId === queue._id ? activeMatch.userBQueueEntryId : activeMatch.userAQueueEntryId;
      matchedUser = await ctx.db.get(partnerQueueId);
    }

    return {
      serverNow: now,
      queueSnapshot: {
        self: sanitizeQueueView(queue),
        onlineCandidates: candidates,
        queueCount: availableEntries.length,
        estimatedWaitMs: availableEntries.length > 1 ? 10_000 : undefined,
        status: queue
          ? queue.activeMatchId
            ? "matched"
            : queue.queueStatus === "matching"
              ? "matching"
              : "queued"
          : "inactive",
      },
      focusWindow: focusWindow
        ? {
            id: focusWindow.id,
            startsAt: focusWindow.startsAt,
            endsAt: focusWindow.endsAt,
            durationMs: focusWindow.durationMs,
          }
        : null,
      focusTarget: focusTarget
        ? {
            queueEntryId: focusTarget._id,
            username: focusTarget.username ?? null,
            avatarId: focusTarget.avatarId ?? null,
          }
        : null,
      selfHold: selfHold
        ? {
            pressEventId: selfHold.pressEventId,
            progressMs: selfHold.progressMs,
            progressRatio: selfHold.progressRatio,
            isReady: selfHold.isReady,
          }
        : null,
      partnerReciprocalHold,
      demoMatch: activeMatch
        ? {
            matchId: activeMatch._id,
            status: activeMatch.status,
            matchedUser: {
              queueEntryId: matchedUser?._id ?? null,
              username: matchedUser?.username ?? null,
              avatarId: matchedUser?.avatarId ?? null,
            },
            windowId: String(activeMatch.matchWindowStart),
          }
        : null,
    };
  },
});
