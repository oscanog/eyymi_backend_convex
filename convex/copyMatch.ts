import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  COPY_MATCH_CONFIG,
  canCommitHoldWithinWindow,
  clampPressEnd,
  getCopyFocusTarget,
  getCopyFocusWindow,
  getHoldProgress,
  sortCopyQueueEntries,
} from "./copyMatchLogic";

type Gender = "male" | "female" | "gay" | "lesbian";
type FilterMode = "preferred_only" | "all_genders";
type CopyPressStatus = "holding" | "ready" | "matched" | "expired" | "cancelled";

const ADMIN_DUMMY_DEPLOYMENT_KEY = "global";

function normalizeScopeKey(scopeKey?: string | null) {
  const trimmed = scopeKey?.trim();
  return trimmed ? trimmed : null;
}

function getParticipantKey(args: {
  scopeKey?: string | null;
  profileUserId?: string;
  username?: string;
}) {
  const identity = args.profileUserId?.trim() || args.username?.trim().toLowerCase() || "";
  if (!identity) return "";
  const scopeKey = normalizeScopeKey(args.scopeKey) ?? "live";
  return `${scopeKey}:${identity}`;
}

function sameScope(entryScopeKey: string | undefined, scopeKey?: string | null) {
  return (entryScopeKey ?? null) === normalizeScopeKey(scopeKey);
}

function isQueueEntryActive(entry: Doc<"copyQueue">, now: number) {
  return entry.isActive && entry.lastHeartbeatAt >= now - COPY_MATCH_CONFIG.QUEUE_STALE_AFTER_MS;
}

function toQueueStatus(entry: Doc<"copyQueue">) {
  if (entry.activeMatchId) return "matched" as const;
  return entry.queueStatus === "matching" ? "matching" as const : "queued" as const;
}

function buildCandidatePool(
  entries: Doc<"copyQueue">[],
  self: Doc<"copyQueue"> | null,
  filterMode: FilterMode,
) {
  const candidatesBase = entries.filter((entry) => {
    if (self && String(entry._id) === String(self._id)) return false;
    if (entry.activeMatchId) return false;
    return true;
  });

  const preferred = self?.preferredMatchGender;
  const filteredCandidates = candidatesBase.filter((entry) => {
    if (filterMode === "all_genders" || !preferred) return true;
    return entry.gender === preferred;
  });

  return {
    preferred,
    candidatesBase,
    filteredCandidates,
    hasCandidatesForPreferred: !!preferred && candidatesBase.some((entry) => entry.gender === preferred),
  };
}

async function getActiveQueueEntries(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  now: number,
  scopeKey?: string | null,
) {
  const activeEntries = await ctx.db
    .query("copyQueue")
    .withIndex("by_isActive_lastHeartbeatAt", (q) => q.eq("isActive", true))
    .collect();

  return sortCopyQueueEntries(
    activeEntries.filter((entry) => isQueueEntryActive(entry, now) && sameScope(entry.scopeKey, scopeKey)),
  );
}

async function getLatestPressByStatuses(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  queueEntryId: Id<"copyQueue">,
  statuses: CopyPressStatus[],
) {
  const rows = await Promise.all(
    statuses.map((status) =>
      ctx.db
        .query("copyPressEvents")
        .withIndex("by_queueEntry_status", (q: any) => q.eq("queueEntryId", queueEntryId).eq("status", status))
        .collect(),
    ),
  );

  return rows
    .flat()
    .sort((a: Doc<"copyPressEvents">, b: Doc<"copyPressEvents">) => b.createdAt - a.createdAt)[0] ?? null;
}

async function getOpenMatch(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  matchId: Id<"copyMatches"> | null,
) {
  if (!matchId) return null;
  const match = await ctx.db.get(matchId);
  if (!match || match.status !== "success_open") {
    return null;
  }
  return match;
}

async function expireWindowPressesForQueueEntry(
  ctx: Pick<MutationCtx, "db">,
  queueEntryId: Id<"copyQueue">,
  focusWindowId: string,
  preservePressId?: Id<"copyPressEvents">,
) {
  const rows = await Promise.all([
    ctx.db
      .query("copyPressEvents")
      .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", queueEntryId).eq("status", "holding"))
      .collect(),
    ctx.db
      .query("copyPressEvents")
      .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", queueEntryId).eq("status", "ready"))
      .collect(),
  ]);

  const now = Date.now();
  for (const press of rows.flat()) {
    if (preservePressId && press._id === preservePressId) continue;
    if ((press.focusWindowId ?? null) === focusWindowId) continue;
    await ctx.db.patch(press._id, {
      status: "expired",
      pressEndedAt: press.pressEndedAt ?? now,
      durationMs: press.durationMs ?? Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
    });
  }
}

async function getExistingPairMatch(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  queueEntryId: Id<"copyQueue">,
  targetQueueEntryId: Id<"copyQueue">,
  focusWindowId: string,
) {
  const matchesA = await ctx.db
    .query("copyMatches")
    .withIndex("by_userAQueueEntryId", (q: any) => q.eq("userAQueueEntryId", queueEntryId))
    .collect();
  const matchesB = await ctx.db
    .query("copyMatches")
    .withIndex("by_userBQueueEntryId", (q: any) => q.eq("userBQueueEntryId", queueEntryId))
    .collect();

  return [...matchesA, ...matchesB].find((match) => {
    if (match.status !== "success_open") return false;
    const isPair =
      (match.userAQueueEntryId === queueEntryId && match.userBQueueEntryId === targetQueueEntryId) ||
      (match.userAQueueEntryId === targetQueueEntryId && match.userBQueueEntryId === queueEntryId);
    return isPair && match.windowId === focusWindowId;
  }) ?? null;
}

function buildFocusState(
  entries: Doc<"copyQueue">[],
  self: Doc<"copyQueue">,
  filterMode: FilterMode,
  now: number,
) {
  const focusWindow = getCopyFocusWindow(now);
  const { filteredCandidates, hasCandidatesForPreferred } = buildCandidatePool(entries, self, filterMode);
  const focusTarget = getCopyFocusTarget(filteredCandidates, self._id, now);
  return {
    focusWindow,
    focusTarget,
    filteredCandidates,
    hasCandidatesForPreferred,
  };
}

async function buildSelfHoldView(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  queueEntryId: Id<"copyQueue">,
  focusWindowId: string,
  now: number,
) {
  const current = await getLatestPressByStatuses(ctx, queueEntryId, ["holding", "ready", "matched"]);
  if (!current || (current.focusWindowId ?? null) !== focusWindowId) {
    return null;
  }

  const effectiveNow = current.readyAt ?? now;
  const progress = current.readyAt
    ? { progressMs: COPY_MATCH_CONFIG.MIN_HOLD_MS, progressRatio: 1 }
    : getHoldProgress(Math.min(effectiveNow, now), current.pressStartedAt);

  return {
    pressEventId: String(current._id),
    progressMs: progress.progressMs,
    progressRatio: progress.progressRatio,
    isReady: current.status === "ready" || current.status === "matched",
    isVisible: current.status === "holding" || current.status === "ready" || current.status === "matched",
  };
}

async function buildPartnerReciprocalHoldView(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  self: Doc<"copyQueue">,
  focusTarget: Doc<"copyQueue"> | null,
  focusWindowId: string,
  now: number,
) {
  if (!focusTarget) return null;

  const rows = await Promise.all([
    ctx.db
      .query("copyPressEvents")
      .withIndex("by_target_status", (q) => q.eq("targetQueueEntryId", self._id).eq("status", "holding"))
      .collect(),
    ctx.db
      .query("copyPressEvents")
      .withIndex("by_target_status", (q) => q.eq("targetQueueEntryId", self._id).eq("status", "ready"))
      .collect(),
  ]);

  const partnerPress = rows
    .flat()
    .filter(
      (press) =>
        press.queueEntryId === focusTarget._id &&
        (press.focusWindowId ?? null) === focusWindowId &&
        press.targetQueueEntryId === self._id,
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

  if (!partnerPress) return null;

  const effectiveNow = partnerPress.readyAt ?? now;
  const progress = partnerPress.readyAt
    ? { progressMs: COPY_MATCH_CONFIG.MIN_HOLD_MS, progressRatio: 1 }
    : getHoldProgress(Math.min(effectiveNow, now), partnerPress.pressStartedAt);

  return {
    queueEntryId: String(focusTarget._id),
    progressMs: progress.progressMs,
    progressRatio: progress.progressRatio,
    isReady: partnerPress.status === "ready" || partnerPress.status === "matched",
    isVisible: true,
  };
}

async function createMatchIfReady(params: {
  ctx: MutationCtx;
  now: number;
  queue: Doc<"copyQueue">;
  targetQueue: Doc<"copyQueue">;
  selfPress: Doc<"copyPressEvents">;
  partnerPress: Doc<"copyPressEvents">;
  focusWindowId: string;
  focusWindowStartsAt: number;
  focusWindowEndsAt: number;
}) {
  const {
    ctx,
    now,
    queue,
    targetQueue,
    selfPress,
    partnerPress,
    focusWindowId,
    focusWindowStartsAt,
    focusWindowEndsAt,
  } = params;

  const existingPairMatch = await getExistingPairMatch(ctx, queue._id, targetQueue._id, focusWindowId);
  if (existingPairMatch) {
    return existingPairMatch;
  }

  const matchId = await ctx.db.insert("copyMatches", {
    scopeKey: queue.scopeKey,
    userAQueueEntryId: queue._id,
    userBQueueEntryId: targetQueue._id,
    userAPressEventId: selfPress._id,
    userBPressEventId: partnerPress._id,
    userAProgressStartAt: selfPress.pressStartedAt,
    userBProgressStartAt: partnerPress.pressStartedAt,
    progressDurationMs: COPY_MATCH_CONFIG.MIN_HOLD_MS,
    matchWindowStart: focusWindowStartsAt,
    matchWindowEnd: focusWindowEndsAt,
    overlapMs: Math.max(
      0,
      Math.min(selfPress.readyAt ?? now, partnerPress.readyAt ?? now) -
        Math.max(selfPress.pressStartedAt, partnerPress.pressStartedAt),
    ),
    status: "success_open",
    createdAt: now,
    readyAt: now,
    windowId: focusWindowId,
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

export const joinQueue = mutation({
  args: {
    profileUserId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    avatarId: v.optional(v.string()),
    gender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.literal("gay"), v.literal("lesbian")),
    ),
    preferredMatchGender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.literal("gay"), v.literal("lesbian")),
    ),
    scopeKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const scopeKey = normalizeScopeKey(args.scopeKey);
    const participantKey = getParticipantKey({
      scopeKey,
      profileUserId: args.profileUserId ? String(args.profileUserId) : undefined,
      username: args.username,
    });
    if (!participantKey) {
      throw new Error("Missing participant identity");
    }

    const existing = await ctx.db
      .query("copyQueue")
      .withIndex("by_participantKey", (q) => q.eq("participantKey", participantKey))
      .collect();

    const active = existing
      .filter((entry) => isQueueEntryActive(entry, now))
      .sort((a, b) => b.joinedAt - a.joinedAt)[0];

    if (active) {
      await ctx.db.patch(active._id, {
        scopeKey: scopeKey ?? undefined,
        profileUserId: args.profileUserId,
        username: args.username,
        avatarId: args.avatarId,
        gender: args.gender,
        preferredMatchGender: args.preferredMatchGender,
        isActive: true,
        queueStatus: active.activeMatchId ? "matched" : "queued",
        lastHeartbeatAt: now,
      });
      return {
        queueEntryId: String(active._id),
        status: active.activeMatchId ? "matched" : "queued",
        serverNow: now,
      };
    }

    const queueEntryId = await ctx.db.insert("copyQueue", {
      participantKey,
      scopeKey: scopeKey ?? undefined,
      profileUserId: args.profileUserId,
      username: args.username,
      avatarId: args.avatarId,
      gender: args.gender,
      preferredMatchGender: args.preferredMatchGender,
      isActive: true,
      queueStatus: "queued",
      joinedAt: now,
      lastHeartbeatAt: now,
    });

    return {
      queueEntryId: String(queueEntryId),
      status: "queued" as const,
      serverNow: now,
    };
  },
});

export const heartbeat = mutation({
  args: { queueEntryId: v.id("copyQueue") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const entry = await ctx.db.get(args.queueEntryId);
    if (!entry) return { ok: false as const, reason: "missing" as const, serverNow: now };
    await ctx.db.patch(entry._id, {
      isActive: true,
      queueStatus: entry.activeMatchId ? "matched" : entry.queueStatus === "matching" ? "matching" : "queued",
      lastHeartbeatAt: now,
    });
    return { ok: true as const, serverNow: now };
  },
});

export const leaveQueue = mutation({
  args: { queueEntryId: v.id("copyQueue") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.queueEntryId);
    if (!entry) return { ok: true as const };

    await ctx.db.patch(entry._id, {
      isActive: false,
      targetQueueEntryId: undefined,
      queueStatus: entry.activeMatchId ? "matched" : "queued",
    });

    const activePresses = await Promise.all([
      ctx.db
        .query("copyPressEvents")
        .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", args.queueEntryId).eq("status", "holding"))
        .collect(),
      ctx.db
        .query("copyPressEvents")
        .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", args.queueEntryId).eq("status", "ready"))
        .collect(),
    ]);

    const now = Date.now();
    for (const press of activePresses.flat()) {
      await ctx.db.patch(press._id, {
        status: "cancelled",
        pressEndedAt: press.pressEndedAt ?? now,
        durationMs: press.durationMs ?? Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
      });
    }
    return { ok: true as const };
  },
});

export const pressStart = mutation({
  args: {
    queueEntryId: v.id("copyQueue"),
    targetQueueEntryId: v.id("copyQueue"),
    focusWindowId: v.string(),
    filterMode: v.optional(v.union(v.literal("preferred_only"), v.literal("all_genders"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const filterMode: FilterMode = args.filterMode ?? "preferred_only";
    const queue = await ctx.db.get(args.queueEntryId);
    if (!queue || !isQueueEntryActive(queue, now)) {
      return { ok: false as const, reason: "queue_inactive" as const, serverNow: now };
    }
    if (queue.activeMatchId) {
      return { ok: false as const, reason: "already_matched" as const, serverNow: now };
    }

    const target = await ctx.db.get(args.targetQueueEntryId);
    if (!target || !isQueueEntryActive(target, now) || !sameScope(target.scopeKey, queue.scopeKey)) {
      return { ok: false as const, reason: "queue_inactive" as const, serverNow: now };
    }

    const activeEntries = await getActiveQueueEntries(ctx, now, queue.scopeKey);
    const { focusWindow, focusTarget } = buildFocusState(activeEntries, queue, filterMode, now);
    if (focusWindow.id !== args.focusWindowId) {
      return { ok: false as const, reason: "focus_window_moved" as const, serverNow: now, focusWindow };
    }
    if (!focusTarget || focusTarget._id !== args.targetQueueEntryId) {
      return { ok: false as const, reason: "invalid_target" as const, serverNow: now, focusWindow };
    }

    await expireWindowPressesForQueueEntry(ctx, queue._id, focusWindow.id);

    const current = await getLatestPressByStatuses(ctx, args.queueEntryId, ["holding", "ready", "matched"]);
    if (
      current &&
      (current.focusWindowId ?? null) === focusWindow.id &&
      current.targetQueueEntryId === args.targetQueueEntryId
    ) {
      return {
        ok: true as const,
        pressEventId: String(current._id),
        reused: true as const,
        isReady: current.status === "ready" || current.status === "matched",
        serverNow: now,
        focusWindow,
      };
    }

    const pressEventId = await ctx.db.insert("copyPressEvents", {
      queueEntryId: args.queueEntryId,
      participantKey: queue.participantKey,
      scopeKey: queue.scopeKey,
      targetQueueEntryId: args.targetQueueEntryId,
      focusWindowId: focusWindow.id,
      pressStartedAt: now,
      status: "holding",
      createdAt: now,
    });

    await ctx.db.patch(queue._id, {
      queueStatus: "matching",
      targetQueueEntryId: args.targetQueueEntryId,
      lastHeartbeatAt: now,
      lastPressAt: now,
    });

    return {
      ok: true as const,
      pressEventId: String(pressEventId),
      reused: false as const,
      isReady: false as const,
      serverNow: now,
      focusWindow,
    };
  },
});

export const pressCommit = mutation({
  args: {
    queueEntryId: v.id("copyQueue"),
    pressEventId: v.id("copyPressEvents"),
    targetQueueEntryId: v.id("copyQueue"),
    focusWindowId: v.string(),
    filterMode: v.optional(v.union(v.literal("preferred_only"), v.literal("all_genders"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const filterMode: FilterMode = args.filterMode ?? "preferred_only";
    const queue = await ctx.db.get(args.queueEntryId);
    const press = await ctx.db.get(args.pressEventId);

    if (!queue || !press || press.queueEntryId !== args.queueEntryId) {
      return { ok: false as const, reason: "missing_press" as const, matched: false as const, serverNow: now };
    }
    if (!isQueueEntryActive(queue, now)) {
      return { ok: false as const, reason: "queue_inactive" as const, matched: false as const, serverNow: now };
    }
    if (queue.activeMatchId) {
      return { ok: true as const, matched: true as const, matchId: String(queue.activeMatchId), serverNow: now };
    }

    const activeEntries = await getActiveQueueEntries(ctx, now, queue.scopeKey);
    const { focusWindow, focusTarget } = buildFocusState(activeEntries, queue, filterMode, now);
    if (focusWindow.id !== args.focusWindowId || (press.focusWindowId ?? null) !== args.focusWindowId) {
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
        targetQueueEntryId: undefined,
        lastHeartbeatAt: now,
      });
      return { ok: true as const, matched: false as const, reason: "window_expired" as const, serverNow: now };
    }

    const readyAt = press.readyAt ?? Math.min(now, focusWindow.endsAt, press.pressStartedAt + COPY_MATCH_CONFIG.MIN_HOLD_MS);
    const durationMs = Math.max(0, readyAt - press.pressStartedAt);
    if (durationMs < COPY_MATCH_CONFIG.MIN_HOLD_MS) {
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
      targetQueueEntryId: args.targetQueueEntryId,
    });

    const targetQueue = await ctx.db.get(args.targetQueueEntryId);
    if (!targetQueue || !isQueueEntryActive(targetQueue, now) || targetQueue.activeMatchId) {
      return { ok: true as const, matched: false as const, reason: "waiting_reciprocal" as const, serverNow: now };
    }

    const reciprocalReadyPresses = await ctx.db
      .query("copyPressEvents")
      .withIndex("by_target_status", (q) => q.eq("targetQueueEntryId", args.queueEntryId).eq("status", "ready"))
      .collect();

    const partnerPress = reciprocalReadyPresses
      .filter(
        (candidate) =>
          candidate.queueEntryId === args.targetQueueEntryId &&
          (candidate.focusWindowId ?? null) === args.focusWindowId &&
          candidate.targetQueueEntryId === args.queueEntryId,
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

    if (!partnerPress) {
      return { ok: true as const, matched: false as const, reason: "waiting_reciprocal" as const, serverNow: now };
    }

    const match = await createMatchIfReady({
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
      matchId: match?._id ? String(match._id) : null,
      serverNow: now,
    };
  },
});

export const pressCancel = mutation({
  args: {
    queueEntryId: v.id("copyQueue"),
    pressEventId: v.id("copyPressEvents"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    const press = await ctx.db.get(args.pressEventId);

    if (!queue || !press || press.queueEntryId !== args.queueEntryId) {
      return { ok: false as const, reason: "missing_press" as const, preserved: false as const, serverNow: now };
    }

    if (press.status === "ready" || press.status === "matched") {
      return { ok: true as const, preserved: true as const, serverNow: now };
    }

    if (press.status !== "holding") {
      return { ok: false as const, reason: "press_not_holding" as const, preserved: false as const, serverNow: now };
    }

    await ctx.db.patch(press._id, {
      status: "cancelled",
      pressEndedAt: now,
      durationMs: Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
    });

    await ctx.db.patch(queue._id, {
      queueStatus: "queued",
      targetQueueEntryId: undefined,
      lastHeartbeatAt: now,
    });

    return { ok: true as const, preserved: false as const, serverNow: now };
  },
});

export const closeMatch = mutation({
  args: {
    queueEntryId: v.id("copyQueue"),
    matchId: v.id("copyMatches"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    const match = await ctx.db.get(args.matchId);
    if (!queue || !match) {
      return { ok: false as const, reason: "missing" as const, serverNow: now };
    }

    if (match.status !== "success_open") {
      return { ok: true as const, serverNow: now };
    }

    await ctx.db.patch(match._id, {
      status: "closed",
    });

    const userAQueue = await ctx.db.get(match.userAQueueEntryId);
    const userBQueue = await ctx.db.get(match.userBQueueEntryId);

    for (const participant of [userAQueue, userBQueue]) {
      if (!participant) continue;
      await ctx.db.patch(participant._id, {
        activeMatchId: undefined,
        queueStatus: "queued",
        targetQueueEntryId: undefined,
        lastHeartbeatAt: now,
      });
    }

    return { ok: true as const, serverNow: now };
  },
});

export const getClientState = query({
  args: {
    queueEntryId: v.optional(v.id("copyQueue")),
    filterMode: v.optional(v.union(v.literal("preferred_only"), v.literal("all_genders"))),
    scopeKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const filterMode: FilterMode = args.filterMode ?? "preferred_only";
    const requestedScopeKey = normalizeScopeKey(args.scopeKey);
    let self = args.queueEntryId ? await ctx.db.get(args.queueEntryId) : null;
    if (self && (!isQueueEntryActive(self, now) || !sameScope(self.scopeKey, requestedScopeKey))) {
      self = null;
    }

    const effectiveScopeKey = self?.scopeKey ?? requestedScopeKey;
    const dummyDeployment = await ctx.db
      .query("adminDummyDeployments")
      .withIndex("by_key", (q) => q.eq("key", ADMIN_DUMMY_DEPLOYMENT_KEY))
      .first();
    const copyVisibilityEnabled = dummyDeployment?.copyVisibilityEnabled ?? true;

    const activeEntries = await getActiveQueueEntries(ctx, now, effectiveScopeKey);
    const scopedEntries = activeEntries.filter((entry) => {
      if (entry.isAdminDummy && !copyVisibilityEnabled) return false;
      return true;
    });

    const candidatePool = buildCandidatePool(scopedEntries, self, filterMode);
    const focusWindow = self ? getCopyFocusWindow(now) : null;
    const focusTarget = self ? getCopyFocusTarget(candidatePool.filteredCandidates, self._id, now) : null;
    const selfHold = self && focusWindow
      ? await buildSelfHoldView(ctx, self._id, focusWindow.id, now)
      : null;
    const partnerReciprocalHold = self && focusWindow
      ? await buildPartnerReciprocalHoldView(ctx, self, focusTarget, focusWindow.id, now)
      : null;
    const activeMatch = self ? await getOpenMatch(ctx, self.activeMatchId ?? null) : null;

    let matchedUser: Doc<"copyQueue"> | null = null;
    if (self && activeMatch) {
      const matchedQueueId =
        activeMatch.userAQueueEntryId === self._id
          ? activeMatch.userBQueueEntryId
          : activeMatch.userAQueueEntryId;
      matchedUser = await ctx.db.get(matchedQueueId);
    }

    return {
      serverNow: now,
      config: COPY_MATCH_CONFIG,
      filterMode,
      self: self
        ? {
            queueEntryId: String(self._id),
            username: self.username ?? null,
            avatarId: self.avatarId ?? null,
            gender: (self.gender ?? null) as Gender | null,
            preferredMatchGender: (self.preferredMatchGender ?? null) as Gender | null,
            queueStatus: toQueueStatus(self),
            targetQueueEntryId: self.targetQueueEntryId ? String(self.targetQueueEntryId) : null,
          }
        : null,
      candidates: candidatePool.filteredCandidates
        .slice(0, 12)
        .map((entry) => ({
          queueEntryId: String(entry._id),
          username: entry.username ?? null,
          avatarId: entry.avatarId ?? null,
          gender: (entry.gender ?? null) as Gender | null,
          joinedAt: entry.joinedAt,
          lastHeartbeatAt: entry.lastHeartbeatAt,
        })),
      hasCandidatesForPreferred: candidatePool.hasCandidatesForPreferred,
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
            queueEntryId: String(focusTarget._id),
            username: focusTarget.username ?? null,
            avatarId: focusTarget.avatarId ?? null,
            gender: (focusTarget.gender ?? null) as Gender | null,
          }
        : null,
      selfHold: selfHold
        ? {
            pressEventId: selfHold.pressEventId,
            progressMs: selfHold.progressMs,
            progressRatio: selfHold.progressRatio,
            isReady: selfHold.isReady,
            isVisible: selfHold.isVisible,
          }
        : null,
      partnerReciprocalHold: partnerReciprocalHold
        ? {
            queueEntryId: partnerReciprocalHold.queueEntryId,
            progressMs: partnerReciprocalHold.progressMs,
            progressRatio: partnerReciprocalHold.progressRatio,
            isReady: partnerReciprocalHold.isReady,
            isVisible: partnerReciprocalHold.isVisible,
          }
        : null,
      activeMatch: activeMatch
        ? {
            matchId: String(activeMatch._id),
            status: "success_open" as const,
            matchedUser: matchedUser
              ? {
                  queueEntryId: String(matchedUser._id),
                  username: matchedUser.username ?? null,
                  avatarId: matchedUser.avatarId ?? null,
                }
              : {
                  queueEntryId: null,
                  username: null,
                  avatarId: null,
                },
            windowId: activeMatch.windowId ?? String(activeMatch.matchWindowStart),
          }
        : null,
    };
  },
});

export const cleanupLifecycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let staleQueue = 0;
    let expiredPresses = 0;

    const allActive = await ctx.db
      .query("copyQueue")
      .withIndex("by_isActive_lastHeartbeatAt", (q) => q.eq("isActive", true))
      .collect();
    for (const entry of allActive) {
      if (isQueueEntryActive(entry, now)) continue;
      await ctx.db.patch(entry._id, { isActive: false, queueStatus: "queued", targetQueueEntryId: undefined });
      staleQueue++;
    }

    const candidateStatuses = ["holding", "ready"] as const;
    for (const status of candidateStatuses) {
      const presses = await ctx.db
        .query("copyPressEvents")
        .withIndex("by_status_startedAt", (q) => q.eq("status", status))
        .collect();

      for (const press of presses) {
        const focusWindowId =
          press.focusWindowId ??
          String(Math.floor(press.pressStartedAt / COPY_MATCH_CONFIG.FOCUS_WINDOW_MS) * COPY_MATCH_CONFIG.FOCUS_WINDOW_MS);
        const windowEndsAt = Number(focusWindowId) + COPY_MATCH_CONFIG.FOCUS_WINDOW_MS;
        const isExpired = now > windowEndsAt || now - press.pressStartedAt > COPY_MATCH_CONFIG.QUEUE_STALE_AFTER_MS;
        if (!isExpired) continue;

        await ctx.db.patch(press._id, {
          status: "expired",
          pressEndedAt: press.pressEndedAt ?? now,
          durationMs: press.durationMs ?? Math.max(0, clampPressEnd(press.pressStartedAt, now) - press.pressStartedAt),
        });
        expiredPresses++;
      }
    }

    return { staleQueue, expiredPresses };
  },
});
