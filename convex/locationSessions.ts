import { v } from "convex/values";
import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { type Id } from "./_generated/dataModel";

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const SESSION_CLEANUP_DELAY_MS = 15000;
const WAITING_SESSION_TTL_MS = 5 * 60 * 1000;
const ACTIVE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return code;
}

async function deleteSessionLocations(ctx: MutationCtx, sessionId: Id<"locationSessions">) {
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_session_time", (q) => q.eq("sessionId", sessionId))
    .collect();

  for (const location of locations) {
    await ctx.db.delete(location._id);
  }

  return locations.length;
}

async function deleteSessionRouteSnapshots(ctx: MutationCtx, sessionId: Id<"locationSessions">) {
  const routes = await ctx.db
    .query("sessionRoutes")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .collect();

  for (const route of routes) {
    await ctx.db.delete(route._id);
  }

  return routes.length;
}

async function deleteSessionMeetingPlaces(ctx: MutationCtx, sessionId: Id<"locationSessions">) {
  const meetingPlaces = await ctx.db
    .query("sessionMeetingPlaces")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .collect();

  for (const meetingPlace of meetingPlaces) {
    await ctx.db.delete(meetingPlace._id);
  }

  return meetingPlaces.length;
}

export const create = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = generateCode();
      const existing = await ctx.db
        .query("locationSessions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique code");
    }

    const now = Date.now();
    const sessionId = await ctx.db.insert("locationSessions", {
      code,
      user1Id: args.userId,
      status: "waiting",
      createdAt: now,
      expiresAt: now + WAITING_SESSION_TTL_MS,
    });

    // Primary cleanup path: deterministic delete around 5 minutes after creation.
    await ctx.scheduler.runAfter(
      WAITING_SESSION_TTL_MS,
      internal.locationSessions.cleanupWaitingSession,
      { sessionId }
    );

    return { sessionId, code };
  },
});

export const join = mutation({
  args: { code: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const normalizedCode = args.code.toUpperCase().trim();

    const session = await ctx.db
      .query("locationSessions")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .first();

    if (!session) {
      throw new Error("Session not found");
    }

    // Idempotency: User already joined this session - return success
    if (session.user2Id === args.userId) {
      return { sessionId: session._id, joined: true, message: "Already joined" };
    }

    if (session.status === "closed") {
      throw new Error("Session has been closed");
    }

    if (session.user2Id !== undefined && session.user2Id !== args.userId) {
      throw new Error("Session is already full");
    }

    if (session.expiresAt < now) {
      throw new Error("Session has expired");
    }

    if (session.user1Id === args.userId) {
      throw new Error("Cannot join your own session");
    }

    await ctx.db.patch(session._id, {
      user2Id: args.userId,
      status: "active",
      expiresAt: now + ACTIVE_SESSION_TTL_MS,
    });

    // Verify the update was persisted
    const updatedSession = await ctx.db.get(session._id);
    if (!updatedSession) {
      throw new Error("Session update failed - session not found after update");
    }

    if (updatedSession.user2Id !== args.userId || updatedSession.status !== "active") {
      throw new Error("Session update failed - changes not persisted");
    }

    return {
      sessionId: session._id,
      joined: true,
      message: "Successfully joined session",
    };
  },
});

export const get = query({
  args: { sessionId: v.id("locationSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const effectiveStatus =
      session.expiresAt < Date.now() && session.status !== "closed"
        ? ("closed" as const)
        : session.status;

    // Fetch user data for both participants
    const user1 = await ctx.db.get(session.user1Id);
    const user2 = session.user2Id
      ? await ctx.db.get(session.user2Id)
      : null;

    return {
      ...session,
      status: effectiveStatus,
      user1: user1 ? { _id: user1._id, username: user1.username } : null,
      user2: user2 ? { _id: user2._id, username: user2.username } : null,
    };
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const normalizedCode = args.code.toUpperCase().trim();
    return await ctx.db
      .query("locationSessions")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .first();
  },
});

export const getActiveForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const [hostSessions, guestSessions] = await Promise.all([
      ctx.db
        .query("locationSessions")
        .withIndex("by_user1", (q) => q.eq("user1Id", args.userId))
        .collect(),
      ctx.db
        .query("locationSessions")
        .withIndex("by_user2", (q) => q.eq("user2Id", args.userId))
        .collect(),
    ]);

    const activeOrWaiting = [...hostSessions, ...guestSessions]
      .filter(
        (session) =>
          (session.status === "waiting" || session.status === "active") &&
          session.expiresAt > now
      )
      .sort((a, b) => b.createdAt - a.createdAt);

    return activeOrWaiting[0] ?? null;
  },
});

export const getParticipantState = query({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return {
        exists: false,
        status: "missing" as const,
        isParticipant: false,
        role: "none" as const,
        canSendLocation: false,
        user2Id: null,
      };
    }

    const effectiveStatus =
      session.expiresAt < Date.now() && session.status !== "closed"
        ? ("closed" as const)
        : session.status;

    const role =
      session.user1Id === args.userId
        ? ("host" as const)
        : session.user2Id === args.userId
          ? ("guest" as const)
          : ("none" as const);

    const isParticipant = role !== "none";
    const canSendLocation =
      isParticipant &&
      (effectiveStatus === "active" ||
        (effectiveStatus === "waiting" && role === "host"));

    return {
      exists: true,
      status: effectiveStatus,
      isParticipant,
      role,
      canSendLocation,
      user2Id: session.user2Id ?? null,
    };
  },
});

export const hasPartnerJoined = query({
  args: { sessionId: v.id("locationSessions") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return { joined: false, state: "missing" as const };
    }

    if (session.status === "active" && session.user2Id !== undefined) {
      return { joined: true, state: "joined" as const };
    }

    if (session.status === "closed") {
      return { joined: false, state: "closed" as const };
    }

    if (session.status === "waiting" && session.expiresAt <= now) {
      return { joined: false, state: "expired" as const };
    }

    return {
      joined: false,
      state: "waiting" as const,
    };
  },
});

export const close = mutation({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.user1Id !== args.userId && session.user2Id !== args.userId) {
      throw new Error("Not authorized");
    }
    if (session.status !== "closed") {
      await ctx.db.patch(args.sessionId, { status: "closed" });
    }

    // Schedule hard cleanup shortly after close so clients can receive "closed" first.
    await ctx.scheduler.runAfter(
      SESSION_CLEANUP_DELAY_MS,
      internal.locationSessions.cleanupClosedSession,
      { sessionId: args.sessionId }
    );

    return true;
  },
});

export const cleanupClosedSession = internalMutation({
  args: { sessionId: v.id("locationSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);

    // Protect active sessions from accidental cleanup calls.
    if (session && session.status !== "closed") {
      return {
        skipped: true,
        reason: "session_not_closed",
        deletedLocations: 0,
        deletedSession: false,
      };
    }

    const deletedLocations = await deleteSessionLocations(ctx, args.sessionId);
    const deletedRoutes = await deleteSessionRouteSnapshots(ctx, args.sessionId);
    const deletedMeetingPlaces = await deleteSessionMeetingPlaces(ctx, args.sessionId);

    if (session) {
      await ctx.db.delete(session._id);
      return {
        skipped: false,
        deletedLocations,
        deletedRoutes,
        deletedMeetingPlaces,
        deletedSession: true,
      };
    }

    return {
      skipped: false,
      deletedLocations,
      deletedRoutes,
      deletedMeetingPlaces,
      deletedSession: false,
    };
  },
});

export const cleanupWaitingSession = internalMutation({
  args: { sessionId: v.id("locationSessions") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db.get(args.sessionId);

    if (!session) {
      return {
        skipped: true,
        reason: "session_missing",
        deletedLocations: 0,
        deletedSession: false,
      };
    }

    if (session.status !== "waiting") {
      return {
        skipped: true,
        reason: "session_not_waiting",
        deletedLocations: 0,
        deletedSession: false,
      };
    }

    if (session.expiresAt > now) {
      return {
        skipped: true,
        reason: "waiting_not_expired",
        deletedLocations: 0,
        deletedSession: false,
      };
    }

    const deletedLocations = await deleteSessionLocations(ctx, args.sessionId);
    const deletedRoutes = await deleteSessionRouteSnapshots(ctx, args.sessionId);
    const deletedMeetingPlaces = await deleteSessionMeetingPlaces(ctx, args.sessionId);
    await ctx.db.delete(args.sessionId);

    return {
      skipped: false,
      deletedLocations,
      deletedRoutes,
      deletedMeetingPlaces,
      deletedSession: true,
    };
  },
});

export const getAllActive = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const waitingCutoff = now - WAITING_SESSION_TTL_MS;
    return await ctx.db
      .query("locationSessions")
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("status"), "active"),
            q.and(
              q.eq(q.field("status"), "waiting"),
              q.gt(q.field("createdAt"), waitingCutoff)
            )
          ),
          q.gt(q.field("expiresAt"), now)
        )
      )
      .collect();
  },
});

export const cleanupStaleWaitingSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Quick short-circuit to minimize work when table is empty.
    const hasAnySession = await ctx.db.query("locationSessions").first();
    if (!hasAnySession) {
      return {
        skipped: true,
        reason: "no_sessions",
        deleted: 0,
        deletedLocations: 0,
        deletedRoutes: 0,
        deletedMeetingPlaces: 0,
      };
    }

    const now = Date.now();
    const waitingCutoff = now - WAITING_SESSION_TTL_MS;

    const staleWaiting = await ctx.db
      .query("locationSessions")
      .withIndex("by_status_createdAt", (q) =>
        q.eq("status", "waiting").lt("createdAt", waitingCutoff)
      )
      .collect();

    if (staleWaiting.length === 0) {
      return {
        skipped: true,
        reason: "no_stale_waiting",
        deleted: 0,
        deletedLocations: 0,
        deletedRoutes: 0,
        deletedMeetingPlaces: 0,
      };
    }

    let deleted = 0;
    let deletedLocations = 0;
    let deletedRoutes = 0;
    let deletedMeetingPlaces = 0;

    for (const session of staleWaiting) {
      // Guard against races with join/close transitions.
      if (session.status !== "waiting" || session.expiresAt > now) {
        continue;
      }

      deletedLocations += await deleteSessionLocations(ctx, session._id);
      deletedRoutes += await deleteSessionRouteSnapshots(ctx, session._id);
      deletedMeetingPlaces += await deleteSessionMeetingPlaces(ctx, session._id);
      await ctx.db.delete(session._id);
      deleted++;
    }

    return {
      skipped: false,
      deleted,
      deletedLocations,
      deletedRoutes,
      deletedMeetingPlaces,
    };
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Quick short-circuit to minimize work when table is empty.
    const hasAnySession = await ctx.db.query("locationSessions").first();
    if (!hasAnySession) {
      return {
        skipped: true,
        reason: "no_sessions",
        deleted: 0,
        deletedLocations: 0,
        deletedRoutes: 0,
        deletedMeetingPlaces: 0,
      };
    }

    const now = Date.now();
    const expired = await ctx.db
      .query("locationSessions")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .collect();

    let deletedLocations = 0;
    let deletedRoutes = 0;
    let deletedMeetingPlaces = 0;
    for (const session of expired) {
      deletedLocations += await deleteSessionLocations(ctx, session._id);
      deletedRoutes += await deleteSessionRouteSnapshots(ctx, session._id);
      deletedMeetingPlaces += await deleteSessionMeetingPlaces(ctx, session._id);

      await ctx.db.delete(session._id);
    }
    return { deleted: expired.length, deletedLocations, deletedRoutes, deletedMeetingPlaces };
  },
});
