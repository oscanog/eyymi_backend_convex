import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { type Doc, type Id } from "./_generated/dataModel";

const INVITE_TTL_MS = 2 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

type InviteStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

function buildPairKey(userA: Id<"users">, userB: Id<"users">): string {
  return [userA, userB].map(String).sort().join(":");
}

function effectiveInviteStatus(invite: Doc<"sessionInvites">, now: number): InviteStatus {
  if (invite.status === "pending" && invite.expiresAt <= now) {
    return "expired";
  }
  return invite.status;
}

function isSessionActive(session: Doc<"locationSessions">, now: number): boolean {
  return session.status !== "closed" && session.expiresAt > now;
}

async function getActiveSessionForUser(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Doc<"locationSessions"> | null> {
  const byUser1 = await ctx.db
    .query("locationSessions")
    .withIndex("by_user1", (q) => q.eq("user1Id", userId))
    .collect();
  const byUser2 = await ctx.db
    .query("locationSessions")
    .withIndex("by_user2", (q) => q.eq("user2Id", userId))
    .collect();

  const now = Date.now();
  return [...byUser1, ...byUser2].find((session) => isSessionActive(session, now)) ?? null;
}

async function generateSessionCode(
  ctx: MutationCtx
): Promise<string> {
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
    }

    const existing = await ctx.db
      .query("locationSessions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!existing) {
      return code;
    }
  }

  throw new Error("Failed to generate unique code");
}

export const send = mutation({
  args: {
    requesterId: v.id("users"),
    recipientId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (args.requesterId === args.recipientId) {
      throw new Error("Cannot send invite to yourself");
    }

    const [requester, recipient] = await Promise.all([
      ctx.db.get(args.requesterId),
      ctx.db.get(args.recipientId),
    ]);

    if (!requester || !recipient) {
      throw new Error("User not found");
    }

    const requesterActiveSession = await getActiveSessionForUser(ctx, args.requesterId);
    if (requesterActiveSession) {
      throw new Error("You are already in an active session");
    }

    const recipientActiveSession = await getActiveSessionForUser(ctx, args.recipientId);
    if (recipientActiveSession) {
      throw new Error("This user is already in an active session");
    }

    const pairKey = buildPairKey(args.requesterId, args.recipientId);
    const now = Date.now();

    const existingPending = await ctx.db
      .query("sessionInvites")
      .withIndex("by_pair_status", (q) => q.eq("pairKey", pairKey).eq("status", "pending"))
      .first();

    if (existingPending) {
      if (existingPending.expiresAt <= now) {
        await ctx.db.patch(existingPending._id, {
          status: "expired",
          updatedAt: now,
          respondedAt: now,
        });
      } else if (existingPending.requesterId === args.requesterId) {
        return {
          inviteId: existingPending._id,
          status: "pending" as const,
          recipientId: args.recipientId,
          recipientName: recipient.username,
          expiresAt: existingPending.expiresAt,
        };
      } else {
        throw new Error("This user already sent you a pending request");
      }
    }

    const inviteId = await ctx.db.insert("sessionInvites", {
      requesterId: args.requesterId,
      recipientId: args.recipientId,
      pairKey,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });

    return {
      inviteId,
      status: "pending" as const,
      recipientId: args.recipientId,
      recipientName: recipient.username,
      expiresAt: now + INVITE_TTL_MS,
    };
  },
});

export const respond = mutation({
  args: {
    inviteId: v.id("sessionInvites"),
    userId: v.id("users"),
    accept: v.boolean(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.recipientId !== args.userId) {
      throw new Error("Not authorized to respond to this invite");
    }

    const now = Date.now();
    const currentStatus = effectiveInviteStatus(invite, now);

    if (currentStatus !== "pending") {
      const session = invite.sessionId ? await ctx.db.get(invite.sessionId) : null;
      return {
        status: currentStatus,
        sessionId: invite.sessionId ?? null,
        code: session?.code ?? null,
      };
    }

    if (invite.expiresAt <= now) {
      await ctx.db.patch(invite._id, {
        status: "expired",
        updatedAt: now,
        respondedAt: now,
      });
      return { status: "expired" as const, sessionId: null, code: null };
    }

    if (!args.accept) {
      await ctx.db.patch(invite._id, {
        status: "declined",
        updatedAt: now,
        respondedAt: now,
      });
      return { status: "declined" as const, sessionId: null, code: null };
    }

    const [requesterActiveSession, recipientActiveSession] = await Promise.all([
      getActiveSessionForUser(ctx, invite.requesterId),
      getActiveSessionForUser(ctx, invite.recipientId),
    ]);

    if (requesterActiveSession || recipientActiveSession) {
      await ctx.db.patch(invite._id, {
        status: "cancelled",
        updatedAt: now,
        respondedAt: now,
      });
      return { status: "cancelled" as const, sessionId: null, code: null };
    }

    const code = await generateSessionCode(ctx);
    const sessionId = await ctx.db.insert("locationSessions", {
      code,
      user1Id: invite.requesterId,
      user2Id: invite.recipientId,
      status: "active",
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });

    await ctx.db.patch(invite._id, {
      status: "accepted",
      sessionId,
      updatedAt: now,
      respondedAt: now,
    });

    return {
      status: "accepted" as const,
      sessionId,
      code,
    };
  },
});

export const cancel = mutation({
  args: {
    inviteId: v.id("sessionInvites"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.requesterId !== args.userId) {
      throw new Error("Not authorized to cancel this invite");
    }

    const now = Date.now();
    const currentStatus = effectiveInviteStatus(invite, now);

    if (currentStatus !== "pending") {
      return { status: currentStatus };
    }

    await ctx.db.patch(invite._id, {
      status: "cancelled",
      updatedAt: now,
      respondedAt: now,
    });

    return { status: "cancelled" as const };
  },
});

export const getIncomingPendingForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const invites = await ctx.db
      .query("sessionInvites")
      .withIndex("by_recipient", (q) => q.eq("recipientId", args.userId))
      .collect();

    const pending = invites
      .filter((invite) => invite.status === "pending" && invite.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt);

    const enriched = await Promise.all(
      pending.map(async (invite) => {
        const requester = await ctx.db.get(invite.requesterId);
        return {
          _id: invite._id,
          requesterId: invite.requesterId,
          requesterName: requester?.username ?? "Unknown user",
          createdAt: invite.createdAt,
          updatedAt: invite.updatedAt,
          expiresAt: invite.expiresAt,
          status: invite.status,
        };
      })
    );

    return enriched;
  },
});

export const getLatestOutgoingForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const invites = await ctx.db
      .query("sessionInvites")
      .withIndex("by_requester", (q) => q.eq("requesterId", args.userId))
      .collect();

    if (invites.length === 0) {
      return null;
    }

    const ordered = invites.sort((a, b) => b.updatedAt - a.updatedAt);
    for (const invite of ordered) {
      const status = effectiveInviteStatus(invite, now);
      if (status === "pending") {
        const recipient = await ctx.db.get(invite.recipientId);
        return {
          _id: invite._id,
          recipientId: invite.recipientId,
          recipientName: recipient?.username ?? "Unknown user",
          status,
          createdAt: invite.createdAt,
          updatedAt: invite.updatedAt,
          expiresAt: invite.expiresAt,
          sessionId: null,
          sessionCode: null,
        };
      }

      if (status === "accepted" && invite.sessionId) {
        const session = await ctx.db.get(invite.sessionId);
        if (!session || !isSessionActive(session, now)) {
          continue;
        }

        const recipient = await ctx.db.get(invite.recipientId);
        return {
          _id: invite._id,
          recipientId: invite.recipientId,
          recipientName: recipient?.username ?? "Unknown user",
          status,
          createdAt: invite.createdAt,
          updatedAt: invite.updatedAt,
          expiresAt: invite.expiresAt,
          sessionId: invite.sessionId,
          sessionCode: session.code,
        };
      }
    }

    return null;
  },
});

export const expirePending = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredPending = await ctx.db
      .query("sessionInvites")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .collect();

    let markedExpired = 0;
    for (const invite of expiredPending) {
      if (invite.status !== "pending") {
        continue;
      }

      await ctx.db.patch(invite._id, {
        status: "expired",
        updatedAt: now,
        respondedAt: now,
      });
      markedExpired++;
    }

    return { markedExpired };
  },
});
