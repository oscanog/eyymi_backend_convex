import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  SOUL_GAME_CONFIG,
  clampPressEnd,
  selectSoulGameMatchCandidate,
} from "./soulGameLogic";

function isQueueEntryActive(entry: Doc<"soulGameQueue">, now: number) {
  return entry.isActive && entry.lastHeartbeatAt >= now - SOUL_GAME_CONFIG.QUEUE_STALE_AFTER_MS;
}

async function getLatestPendingPressForQueueEntry(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  queueEntryId: Id<"soulGameQueue">,
): Promise<Doc<"soulGamePressEvents"> | null> {
  const pending = await ctx.db
    .query("soulGamePressEvents")
    .withIndex("by_queueEntry_status", (q: any) => q.eq("queueEntryId", queueEntryId).eq("status", "pending"))
    .collect();

  return pending.sort((a: Doc<"soulGamePressEvents">, b: Doc<"soulGamePressEvents">) => b.pressStartedAt - a.pressStartedAt)[0] ?? null;
}

async function findCurrentMatchForQueueEntry(
  ctx: Pick<QueryCtx, "db">,
  queueEntryId: Id<"soulGameQueue">,
): Promise<Doc<"soulGameMatches"> | null> {
  const [matchesA, matchesB] = await Promise.all([
    ctx.db
      .query("soulGameMatches")
      .withIndex("by_userAQueueEntryId", (q: any) => q.eq("userAQueueEntryId", queueEntryId))
      .collect(),
    ctx.db
      .query("soulGameMatches")
      .withIndex("by_userBQueueEntryId", (q: any) => q.eq("userBQueueEntryId", queueEntryId))
      .collect(),
  ]);

  const all = [...matchesA, ...matchesB].sort(
    (a: Doc<"soulGameMatches">, b: Doc<"soulGameMatches">) => b.createdAt - a.createdAt,
  );
  return all.find((m) => m.status === "pending_intro" || m.status === "active_2min") ?? null;
}

async function getOrCreateSessionForMatch(
  ctx: Pick<MutationCtx, "db">,
  matchId: Id<"soulGameMatches">,
): Promise<Doc<"soulGameSessions"> | null> {
  const existing = await ctx.db
    .query("soulGameSessions")
    .withIndex("by_matchId", (q: any) => q.eq("matchId", matchId))
    .first();
  if (existing) return existing;

  const match = await ctx.db.get(matchId);
  if (!match) return null;

  const startedAt = Date.now();
  const endsAt = startedAt + SOUL_GAME_CONFIG.SESSION_DURATION_MS;
  const sessionId = await ctx.db.insert("soulGameSessions", {
    matchId,
    userAQueueEntryId: match.userAQueueEntryId,
    userBQueueEntryId: match.userBQueueEntryId,
    startedAt,
    endsAt,
    status: "active",
  });

  await ctx.db.patch(matchId, {
    sessionId,
    conversationEndsAt: endsAt,
    status: "active_2min",
  });

  return await ctx.db.get(sessionId);
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

export const pressStart = mutation({
  args: { queueEntryId: v.id("soulGameQueue") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    if (!queue || !isQueueEntryActive(queue, now)) {
      return { ok: false as const, reason: "queue_inactive" as const, serverNow: now };
    }
    if (queue.activeMatchId) {
      return { ok: false as const, reason: "already_matched" as const, serverNow: now };
    }

    const existingPending = await getLatestPendingPressForQueueEntry(ctx, args.queueEntryId);
    if (existingPending && existingPending.pressEndedAt === undefined) {
      return {
        ok: true as const,
        pressEventId: existingPending._id,
        reused: true as const,
        serverNow: now,
      };
    }

    const pressEventId = await ctx.db.insert("soulGamePressEvents", {
      queueEntryId: args.queueEntryId,
      participantKey: queue.participantKey,
      pressStartedAt: now,
      status: "pending",
      createdAt: now,
    });

    await ctx.db.patch(queue._id, {
      queueStatus: "matching",
      lastPressAt: now,
      lastHeartbeatAt: now,
    });

    return { ok: true as const, pressEventId, reused: false as const, serverNow: now };
  },
});

export const pressEnd = mutation({
  args: { queueEntryId: v.id("soulGameQueue"), pressEventId: v.id("soulGamePressEvents") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const queue = await ctx.db.get(args.queueEntryId);
    const press = await ctx.db.get(args.pressEventId);

    if (!queue || !press || press.queueEntryId !== args.queueEntryId) {
      return { ok: false as const, reason: "missing_press" as const, matched: false as const, serverNow: now };
    }

    if (queue.activeMatchId) {
      return { ok: true as const, matched: true as const, matchId: queue.activeMatchId, serverNow: now };
    }

    if (press.status !== "pending") {
      return {
        ok: false as const,
        reason: "press_not_pending" as const,
        matched: false as const,
        serverNow: now,
      };
    }

    const endedAt = clampPressEnd(press.pressStartedAt, now);
    const durationMs = Math.max(0, endedAt - press.pressStartedAt);

    await ctx.db.patch(press._id, {
      pressEndedAt: endedAt,
      durationMs,
      status: durationMs >= SOUL_GAME_CONFIG.MIN_HOLD_MS ? "pending" : "expired",
    });

    await ctx.db.patch(queue._id, {
      queueStatus: "queued",
      lastHeartbeatAt: now,
      lastPressAt: endedAt,
    });

    if (durationMs < SOUL_GAME_CONFIG.MIN_HOLD_MS) {
      return {
        ok: true as const,
        matched: false as const,
        reason: "min_hold" as const,
        durationMs,
        serverNow: now,
      };
    }

    const candidatePresses = await ctx.db
      .query("soulGamePressEvents")
      .withIndex("by_status_startedAt", (q) => q.eq("status", "pending"))
      .collect();

    const currentInterval = { start: press.pressStartedAt, end: endedAt };

    const candidateQueueMap = new Map<string, Doc<"soulGameQueue"> | null>();
    const candidateInputs = [];
    for (const candidate of candidatePresses) {
      if (candidate._id === press._id) continue;
      if (candidate.queueEntryId === args.queueEntryId) continue;
      if (candidate.pressEndedAt === undefined || candidate.durationMs === undefined) continue;

      const queueKey = String(candidate.queueEntryId);
      let candidateQueue = candidateQueueMap.get(queueKey) ?? null;
      if (!candidateQueueMap.has(queueKey)) {
        candidateQueue = await ctx.db.get(candidate.queueEntryId);
        candidateQueueMap.set(queueKey, candidateQueue);
      }

      candidateInputs.push({
        queueEntryId: String(candidate.queueEntryId),
        pressEventId: String(candidate._id),
        interval: { start: candidate.pressStartedAt, end: candidate.pressEndedAt },
        durationMs: candidate.durationMs,
        isQueueActive: Boolean(candidateQueue && isQueueEntryActive(candidateQueue, now)),
        hasActiveMatch: Boolean(candidateQueue?.activeMatchId),
        isAlreadyMatchedPress: Boolean(candidate.matchId),
        createdAt: candidate.createdAt,
      });
    }

    const selected = selectSoulGameMatchCandidate({
      currentQueueEntryId: String(args.queueEntryId),
      currentPressEventId: String(press._id),
      currentInterval,
      currentDurationMs: durationMs,
      candidates: candidateInputs,
    });

    if (selected) {
      const candidate = candidatePresses.find((item) => String(item._id) === selected.candidatePressEventId);
      if (candidate) {
        const candidateQueue = await ctx.db.get(candidate.queueEntryId);
        if (candidateQueue && isQueueEntryActive(candidateQueue, now) && !candidateQueue.activeMatchId) {

          const matchId = await ctx.db.insert("soulGameMatches", {
            userAQueueEntryId: args.queueEntryId,
            userBQueueEntryId: candidate.queueEntryId,
            userAPressEventId: press._id,
            userBPressEventId: candidate._id,
            matchWindowStart: selected.overlap.start,
            matchWindowEnd: selected.overlap.end,
            overlapMs: selected.overlap.overlapMs,
            createdAt: now,
            status: "pending_intro",
          });

          await ctx.db.patch(press._id, { status: "matched", matchId });
          await ctx.db.patch(candidate._id, { status: "matched", matchId });

          await ctx.db.patch(queue._id, {
            activeMatchId: matchId,
            queueStatus: "matched",
            lastHeartbeatAt: now,
          });
          await ctx.db.patch(candidateQueue._id, {
            activeMatchId: matchId,
            queueStatus: "matched",
            lastHeartbeatAt: now,
          });

          const session = await getOrCreateSessionForMatch(ctx, matchId);

          return {
            ok: true as const,
            matched: true as const,
            matchId,
            sessionId: session?._id ?? null,
            overlapMs: selected.overlap.overlapMs,
            serverNow: now,
          };
        }
      }
    }

    return {
      ok: true as const,
      matched: false as const,
      reason: "no_overlap" as const,
      durationMs,
      serverNow: now,
    };
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

    const activeQueueEntries = await ctx.db
      .query("soulGameQueue")
      .withIndex("by_isActive_lastHeartbeatAt", (q) => q.eq("isActive", true))
      .collect();
    const freshActiveQueueEntries = activeQueueEntries.filter((entry) => isQueueEntryActive(entry, now));
    const freshAvailableQueueEntries = freshActiveQueueEntries.filter((entry) => !entry.activeMatchId);

    const candidates = freshAvailableQueueEntries
      .filter((entry) => !args.queueEntryId || entry._id !== args.queueEntryId)
      .sort((a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt)
      .slice(0, 12)
      .map((entry) => ({
        queueEntryId: entry._id,
        username: entry.username ?? null,
        avatarId: entry.avatarId ?? null,
        joinedAt: entry.joinedAt,
        lastHeartbeatAt: entry.lastHeartbeatAt,
      }));

    let match = queue ? await findCurrentMatchForQueueEntry(ctx, queue._id) : null;
    let session = match?.sessionId ? await ctx.db.get(match.sessionId) : null;
    const effectiveSessionStatus =
      session && session.status === "active" && session.endsAt <= now ? "ended" : session?.status ?? null;
    const effectiveMatchStatus =
      session && effectiveSessionStatus === "ended"
        ? "ended"
        : match?.status ?? null;

    let partnerQueue: Doc<"soulGameQueue"> | null = null;
    if (match && queue) {
      const partnerQueueId =
        match.userAQueueEntryId === queue._id ? match.userBQueueEntryId : match.userAQueueEntryId;
      partnerQueue = await ctx.db.get(partnerQueueId);
    }

    return {
      serverNow: now,
      queueSnapshot: {
        self: sanitizeQueueView(queue),
        onlineCandidates: candidates,
        queueCount: freshAvailableQueueEntries.length,
        estimatedWaitMs: freshAvailableQueueEntries.length > 1 ? 10_000 : undefined,
        status: queue
          ? queue.activeMatchId
            ? "matched"
            : queue.queueStatus === "matching"
              ? "matching"
              : "queued"
          : "inactive",
      },
      activePress: queue ? await getLatestPendingPressForQueueEntry(ctx, queue._id) : null,
      matchSnapshot: match
        ? {
            matchId: match._id,
            userAQueueEntryId: match.userAQueueEntryId,
            userBQueueEntryId: match.userBQueueEntryId,
            matchWindowStart: match.matchWindowStart,
            matchWindowEnd: match.matchWindowEnd,
            overlapMs: match.overlapMs,
            createdAt: match.createdAt,
            status: effectiveMatchStatus ?? match.status,
            conversationEndsAt: match.conversationEndsAt ?? null,
          }
        : null,
      session: match && session
        ? {
            sessionId: session._id,
            matchId: match._id,
            status: effectiveMatchStatus ?? match.status,
            matchedUser: {
              username: partnerQueue?.username ?? null,
              avatarId: partnerQueue?.avatarId ?? null,
            },
            createdAt: match.createdAt,
            conversationEndsAt: match.conversationEndsAt ?? session.endsAt,
            effectiveSessionStatus,
          }
        : null,
    };
  },
});
