import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { COPY_MATCH_CONFIG, clampPressEnd, getIntervalOverlap } from "./copyMatchLogic";

type Gender = "male" | "female" | "gay" | "lesbian";
type FilterMode = "preferred_only" | "all_genders";
const ADMIN_DUMMY_DEPLOYMENT_KEY = "global";

function getParticipantKey(args: {
  profileUserId?: string;
  username?: string;
}) {
  return args.profileUserId?.trim() || args.username?.trim().toLowerCase() || "";
}

function isQueueEntryActive(entry: Doc<"copyQueue">, now: number) {
  return entry.isActive && entry.lastHeartbeatAt >= now - COPY_MATCH_CONFIG.QUEUE_STALE_AFTER_MS;
}

function toQueueStatus(entry: Doc<"copyQueue">) {
  if (entry.activeMatchId) return "matched" as const;
  return entry.queueStatus === "matching" ? "matching" as const : "queued" as const;
}

async function getLatestPendingPressForQueueEntry(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  queueEntryId: Id<"copyQueue">,
) {
  const rows = await ctx.db
    .query("copyPressEvents")
    .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", queueEntryId).eq("status", "pending"))
    .collect();
  return rows.sort((a, b) => b.pressStartedAt - a.pressStartedAt)[0] ?? null;
}

export const joinQueue = mutation({
  args: {
    profileUserId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    avatarId: v.optional(v.string()),
    gender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.literal("gay"), v.literal("lesbian"))
    ),
    preferredMatchGender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.literal("gay"), v.literal("lesbian"))
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const participantKey = getParticipantKey({
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
      queueStatus: entry.activeMatchId ? "matched" : "queued",
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
    const pendingPresses = await ctx.db
      .query("copyPressEvents")
      .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", args.queueEntryId).eq("status", "pending"))
      .collect();
    for (const press of pendingPresses) {
      await ctx.db.patch(press._id, { status: "cancelled", pressEndedAt: Date.now() });
    }
    return { ok: true as const };
  },
});

export const updateTarget = mutation({
  args: {
    queueEntryId: v.id("copyQueue"),
    targetQueueEntryId: v.id("copyQueue"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const self = await ctx.db.get(args.queueEntryId);
    const target = await ctx.db.get(args.targetQueueEntryId);
    if (!self || !target) return { ok: false as const, reason: "missing" as const, serverNow: now };
    if (!isQueueEntryActive(self, now) || !isQueueEntryActive(target, now)) {
      return { ok: false as const, reason: "inactive" as const, serverNow: now };
    }
    if (self._id === target._id) return { ok: false as const, reason: "self_target" as const, serverNow: now };
    await ctx.db.patch(self._id, {
      targetQueueEntryId: target._id,
      lastHeartbeatAt: now,
    });
    return { ok: true as const, serverNow: now };
  },
});

export const pressStart = mutation({
  args: {
    queueEntryId: v.id("copyQueue"),
    targetQueueEntryId: v.id("copyQueue"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    const target = await ctx.db.get(args.targetQueueEntryId);
    if (!queue || !target || !isQueueEntryActive(queue, now) || !isQueueEntryActive(target, now)) {
      return { ok: false as const, reason: "queue_inactive" as const, serverNow: now };
    }
    if (queue.activeMatchId) {
      return { ok: false as const, reason: "already_matched" as const, serverNow: now };
    }
    if (String(args.queueEntryId) === String(args.targetQueueEntryId)) {
      return { ok: false as const, reason: "self_target" as const, serverNow: now };
    }

    const existingPending = await getLatestPendingPressForQueueEntry(ctx, args.queueEntryId);
    if (existingPending && existingPending.pressEndedAt === undefined) {
      return { ok: true as const, pressEventId: String(existingPending._id), reused: true as const, serverNow: now };
    }

    const pressEventId = await ctx.db.insert("copyPressEvents", {
      queueEntryId: args.queueEntryId,
      targetQueueEntryId: args.targetQueueEntryId,
      pressStartedAt: now,
      status: "pending",
      createdAt: now,
    });

    await ctx.db.patch(queue._id, {
      queueStatus: "matching",
      targetQueueEntryId: args.targetQueueEntryId,
      lastHeartbeatAt: now,
    });

    return { ok: true as const, pressEventId: String(pressEventId), reused: false as const, serverNow: now };
  },
});

export const pressEnd = mutation({
  args: {
    queueEntryId: v.id("copyQueue"),
    pressEventId: v.id("copyPressEvents"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    const press = await ctx.db.get(args.pressEventId);
    if (!queue || !press || String(press.queueEntryId) !== String(args.queueEntryId)) {
      return { ok: false as const, reason: "missing_press" as const, matched: false as const, serverNow: now };
    }
    if (queue.activeMatchId) {
      return { ok: true as const, matched: true as const, matchId: String(queue.activeMatchId), serverNow: now };
    }
    if (press.status !== "pending") {
      return { ok: false as const, reason: "press_not_pending" as const, matched: false as const, serverNow: now };
    }

    const endedAt = clampPressEnd(press.pressStartedAt, now);
    const durationMs = Math.max(0, endedAt - press.pressStartedAt);
    await ctx.db.patch(press._id, {
      pressEndedAt: endedAt,
      durationMs,
      status: durationMs >= COPY_MATCH_CONFIG.MIN_HOLD_MS ? "pending" : "expired",
    });

    await ctx.db.patch(queue._id, {
      queueStatus: "queued",
      lastHeartbeatAt: now,
    });

    if (durationMs < COPY_MATCH_CONFIG.MIN_HOLD_MS) {
      return { ok: true as const, matched: false as const, reason: "min_hold" as const, durationMs, serverNow: now };
    }

    const candidates = await ctx.db
      .query("copyPressEvents")
      .withIndex("by_target_status", (q) => q.eq("targetQueueEntryId", args.queueEntryId).eq("status", "pending"))
      .collect();

    const selfInterval = { start: press.pressStartedAt, end: endedAt };
    for (const candidatePress of candidates.sort((a, b) => b.createdAt - a.createdAt)) {
      if (String(candidatePress._id) === String(press._id)) continue;
      if (candidatePress.pressEndedAt === undefined || candidatePress.durationMs === undefined) continue;
      if (candidatePress.durationMs < COPY_MATCH_CONFIG.MIN_HOLD_MS) continue;

      const candidateQueue = await ctx.db.get(candidatePress.queueEntryId);
      if (!candidateQueue || !isQueueEntryActive(candidateQueue, now) || candidateQueue.activeMatchId) continue;
      if (String(candidateQueue.targetQueueEntryId) !== String(args.queueEntryId)) continue;
      if (String(press.targetQueueEntryId) !== String(candidateQueue._id)) continue;

      const overlap = getIntervalOverlap(selfInterval, {
        start: candidatePress.pressStartedAt,
        end: candidatePress.pressEndedAt,
      });
      if (!overlap || overlap.overlapMs < COPY_MATCH_CONFIG.MIN_OVERLAP_MS) continue;

      const matchId = await ctx.db.insert("copyMatches", {
        userAQueueEntryId: args.queueEntryId,
        userBQueueEntryId: candidateQueue._id,
        userAPressEventId: press._id,
        userBPressEventId: candidatePress._id,
        userAProgressStartAt: now,
        userBProgressStartAt: now,
        progressDurationMs: COPY_MATCH_CONFIG.RING_PROGRESS_MS,
        matchWindowStart: overlap.start,
        matchWindowEnd: overlap.end,
        overlapMs: overlap.overlapMs,
        status: "pending_progress",
        createdAt: now,
      });

      await ctx.db.patch(press._id, { status: "matched", matchId });
      await ctx.db.patch(candidatePress._id, { status: "matched", matchId });
      await ctx.db.patch(queue._id, { activeMatchId: matchId, queueStatus: "matched", lastHeartbeatAt: now });
      await ctx.db.patch(candidateQueue._id, { activeMatchId: matchId, queueStatus: "matched", lastHeartbeatAt: now });

      return {
        ok: true as const,
        matched: true as const,
        matchId: String(matchId),
        overlapMs: overlap.overlapMs,
        serverNow: now,
      };
    }

    return { ok: true as const, matched: false as const, reason: "no_overlap" as const, durationMs, serverNow: now };
  },
});

export const getClientState = query({
  args: {
    queueEntryId: v.optional(v.id("copyQueue")),
    filterMode: v.optional(v.union(v.literal("preferred_only"), v.literal("all_genders"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const filterMode: FilterMode = args.filterMode ?? "preferred_only";
    let self = args.queueEntryId ? await ctx.db.get(args.queueEntryId) : null;
    if (self && !isQueueEntryActive(self, now)) self = null;
    const dummyDeployment = await ctx.db
      .query("adminDummyDeployments")
      .withIndex("by_key", (q) => q.eq("key", ADMIN_DUMMY_DEPLOYMENT_KEY))
      .first();
    const copyVisibilityEnabled = dummyDeployment?.copyVisibilityEnabled ?? true;

    const allActive = await ctx.db
      .query("copyQueue")
      .withIndex("by_isActive_lastHeartbeatAt", (q) => q.eq("isActive", true))
      .collect();
    const activeEntries = allActive.filter((entry) => isQueueEntryActive(entry, now));

    const candidatesBase = activeEntries.filter((entry) => {
      if (self && String(entry._id) === String(self._id)) return false;
      if (entry.activeMatchId) return false;
      if (entry.isAdminDummy && !copyVisibilityEnabled) return false;
      return true;
    });
    const preferred = self?.preferredMatchGender;
    const filteredCandidates = candidatesBase.filter((entry) => {
      if (filterMode === "all_genders" || !preferred) return true;
      return entry.gender === preferred;
    });

    const activePress = self ? await getLatestPendingPressForQueueEntry(ctx, self._id) : null;
    const currentMatch = self?.activeMatchId ? await ctx.db.get(self.activeMatchId) : null;

    let resolvedMatch = currentMatch;
    if (currentMatch && currentMatch.status === "pending_progress") {
      const readyAt = Math.max(currentMatch.userAProgressStartAt, currentMatch.userBProgressStartAt) + currentMatch.progressDurationMs;
      if (now >= readyAt) {
        await (ctx as any).db.patch(currentMatch._id, { status: "ready", readyAt });
        resolvedMatch = await ctx.db.get(currentMatch._id);
      }
    }

    let partnerQueue: Doc<"copyQueue"> | null = null;
    let selfDirection: "clockwise" | "counter_clockwise" | null = null;
    if (self && resolvedMatch) {
      const selfIsA = String(resolvedMatch.userAQueueEntryId) === String(self._id);
      const partnerId = selfIsA ? resolvedMatch.userBQueueEntryId : resolvedMatch.userAQueueEntryId;
      partnerQueue = await ctx.db.get(partnerId);
      selfDirection = selfIsA ? "clockwise" : "counter_clockwise";
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
      candidates: filteredCandidates
        .sort((a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt)
        .slice(0, 12)
        .map((entry) => ({
          queueEntryId: String(entry._id),
          username: entry.username ?? null,
          avatarId: entry.avatarId ?? null,
          gender: (entry.gender ?? null) as Gender | null,
          joinedAt: entry.joinedAt,
          lastHeartbeatAt: entry.lastHeartbeatAt,
        })),
      hasCandidatesForPreferred:
        !!preferred && candidatesBase.some((entry) => entry.gender === preferred),
      activePress: activePress
        ? {
            pressEventId: String(activePress._id),
            targetQueueEntryId: String(activePress.targetQueueEntryId),
            pressStartedAt: activePress.pressStartedAt,
            pressEndedAt: activePress.pressEndedAt ?? null,
            durationMs: activePress.durationMs ?? null,
            status: activePress.status,
          }
        : null,
      match: resolvedMatch
        ? {
            matchId: String(resolvedMatch._id),
            status: resolvedMatch.status,
            userAProgressStartAt: resolvedMatch.userAProgressStartAt,
            userBProgressStartAt: resolvedMatch.userBProgressStartAt,
            progressDurationMs: resolvedMatch.progressDurationMs,
            readyAt: resolvedMatch.readyAt ?? null,
            selfDirection,
            partner: partnerQueue
              ? {
                  queueEntryId: String(partnerQueue._id),
                  username: partnerQueue.username ?? null,
                  avatarId: partnerQueue.avatarId ?? null,
                }
              : null,
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
    let readyMatches = 0;

    const allActive = await ctx.db
      .query("copyQueue")
      .withIndex("by_isActive_lastHeartbeatAt", (q) => q.eq("isActive", true))
      .collect();
    for (const entry of allActive) {
      if (isQueueEntryActive(entry, now)) continue;
      await ctx.db.patch(entry._id, { isActive: false, queueStatus: "queued", targetQueueEntryId: undefined });
      staleQueue++;
    }

    const pendingPresses = await ctx.db
      .query("copyPressEvents")
      .withIndex("by_status_startedAt", (q) => q.eq("status", "pending"))
      .collect();
    for (const press of pendingPresses) {
      if (press.pressEndedAt !== undefined) continue;
      if (now - press.pressStartedAt <= COPY_MATCH_CONFIG.QUEUE_STALE_AFTER_MS) continue;
      await ctx.db.patch(press._id, {
        status: "expired",
        pressEndedAt: now,
        durationMs: Math.max(0, now - press.pressStartedAt),
      });
      expiredPresses++;
    }

    const pendingMatches = await ctx.db
      .query("copyMatches")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "pending_progress"))
      .collect();
    for (const match of pendingMatches) {
      const readyAt = Math.max(match.userAProgressStartAt, match.userBProgressStartAt) + match.progressDurationMs;
      if (now < readyAt) continue;
      await ctx.db.patch(match._id, { status: "ready", readyAt });
      readyMatches++;
    }

    return { staleQueue, expiredPresses, readyMatches };
  },
});
