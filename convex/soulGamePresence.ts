import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { SOUL_GAME_CONFIG } from "./soulGameLogic";

function getParticipantKey(args: {
  authUserId?: string;
  profileUserId?: string;
  username?: string;
}) {
  return (
    args.authUserId?.trim() ||
    args.profileUserId?.trim() ||
    args.username?.trim().toLowerCase() ||
    ""
  );
}

function isQueueEntryActive(entry: Doc<"soulGameQueue">, now: number) {
  return entry.isActive && entry.lastHeartbeatAt >= now - SOUL_GAME_CONFIG.QUEUE_STALE_AFTER_MS;
}

async function findQueueEntryByParticipantKey(
  ctx: { db: any },
  participantKey: string,
) {
  return await ctx.db
    .query("soulGameQueue")
    .withIndex("by_participantKey", (q: any) => q.eq("participantKey", participantKey))
    .collect();
}

export const joinQueue = mutation({
  args: {
    authUserId: v.optional(v.string()),
    profileUserId: v.optional(v.string()),
    username: v.optional(v.string()),
    avatarId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const participantKey = getParticipantKey(args);

    if (!participantKey) {
      throw new Error("Missing participant identity");
    }

    const existingEntries = await findQueueEntryByParticipantKey(ctx, participantKey);
    const activeEntry = existingEntries
      .filter((entry: Doc<"soulGameQueue">) => isQueueEntryActive(entry, now))
      .sort((a: Doc<"soulGameQueue">, b: Doc<"soulGameQueue">) => b.joinedAt - a.joinedAt)[0];

    if (activeEntry) {
      await ctx.db.patch(activeEntry._id, {
        authUserId: args.authUserId,
        profileUserId: args.profileUserId,
        username: args.username,
        avatarId: args.avatarId,
        isActive: true,
        queueStatus: activeEntry.activeMatchId ? "matched" : "queued",
        lastHeartbeatAt: now,
      });

      return {
        queueEntryId: activeEntry._id,
        status: activeEntry.activeMatchId ? "matched" : "queued",
        joinedAt: activeEntry.joinedAt,
        serverNow: now,
      };
    }

    const queueEntryId = await ctx.db.insert("soulGameQueue", {
      participantKey,
      authUserId: args.authUserId,
      profileUserId: args.profileUserId,
      username: args.username,
      avatarId: args.avatarId,
      isActive: true,
      queueStatus: "queued",
      joinedAt: now,
      lastHeartbeatAt: now,
    });

    return { queueEntryId, status: "queued" as const, joinedAt: now, serverNow: now };
  },
});

export const heartbeat = mutation({
  args: { queueEntryId: v.id("soulGameQueue") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const entry = await ctx.db.get(args.queueEntryId);
    if (!entry) {
      return { ok: false as const, reason: "missing" as const, serverNow: now };
    }

    await ctx.db.patch(entry._id, {
      isActive: true,
      lastHeartbeatAt: now,
      queueStatus: entry.activeMatchId ? "matched" : "queued",
    });

    return { ok: true as const, serverNow: now };
  },
});

export const leaveQueue = mutation({
  args: { queueEntryId: v.id("soulGameQueue") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.queueEntryId);
    if (!entry) return { ok: true as const };

    await ctx.db.patch(entry._id, {
      isActive: false,
      queueStatus: entry.activeMatchId ? entry.queueStatus : "queued",
    });

    const pendingPresses = await ctx.db
      .query("soulGamePressEvents")
      .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", args.queueEntryId).eq("status", "holding"))
      .collect();

    for (const press of pendingPresses) {
      await ctx.db.patch(press._id, { status: "cancelled", pressEndedAt: Date.now() });
    }

    const readyPresses = await ctx.db
      .query("soulGamePressEvents")
      .withIndex("by_queueEntry_status", (q) => q.eq("queueEntryId", args.queueEntryId).eq("status", "ready"))
      .collect();

    for (const press of readyPresses) {
      await ctx.db.patch(press._id, { status: "cancelled", pressEndedAt: Date.now() });
    }

    return { ok: true as const };
  },
});

export const getQueueSnapshot = query({
  args: { queueEntryId: v.optional(v.id("soulGameQueue")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const allActive = await ctx.db
      .query("soulGameQueue")
      .withIndex("by_isActive_lastHeartbeatAt", (q) => q.eq("isActive", true))
      .collect();

    const activeEntries = allActive
      .filter((entry) => isQueueEntryActive(entry, now))
      .sort((a, b) => b.lastHeartbeatAt - a.lastHeartbeatAt);

    const self = args.queueEntryId ? await ctx.db.get(args.queueEntryId) : null;
    const selfActive = self && isQueueEntryActive(self, now) ? self : null;

    const onlineCandidates = activeEntries
      .filter((entry) => !args.queueEntryId || entry._id !== args.queueEntryId)
      .slice(0, 12)
      .map((entry) => ({
        queueEntryId: entry._id,
        username: entry.username,
        avatarId: entry.avatarId,
        joinedAt: entry.joinedAt,
        lastHeartbeatAt: entry.lastHeartbeatAt,
      }));

    return {
      self: selfActive
        ? {
            queueEntryId: selfActive._id,
            authUserId: selfActive.authUserId ?? null,
            profileUserId: selfActive.profileUserId ?? null,
            username: selfActive.username ?? null,
            avatarId: selfActive.avatarId ?? null,
            isActive: selfActive.isActive,
            joinedAt: selfActive.joinedAt,
            lastHeartbeatAt: selfActive.lastHeartbeatAt,
          }
        : null,
      onlineCandidates,
      queueCount: activeEntries.length,
      estimatedWaitMs: activeEntries.length > 1 ? 10_000 : undefined,
      status: selfActive
        ? selfActive.activeMatchId
          ? "matched"
          : "queued"
        : "inactive",
      serverNow: now,
    };
  },
});

