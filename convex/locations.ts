import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { type Id } from "./_generated/dataModel";

export const update = mutation({
  args: {
    sessionId: v.id("locationSessions"),
    userId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const isUser1 = session.user1Id === args.userId;
    const isUser2 = session.user2Id === args.userId;

    if (!isUser1 && !isUser2) {
      throw new Error("User not in session");
    }

    if (session.status === "closed") {
      throw new Error("Session is closed");
    }

    if (session.status === "waiting" && !isUser1) {
      throw new Error("Session not active yet");
    }

    const locationId = await ctx.db.insert("locations", {
      sessionId: args.sessionId,
      userId: args.userId,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      timestamp: Date.now(),
    });

    return { success: true, locationId };
  },
});

export const getPartnerLocation = query({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const partnerId: Id<"users"> | undefined =
      session.user1Id === args.userId ? session.user2Id :
      session.user2Id === args.userId ? session.user1Id :
      undefined;

    if (!partnerId) return null;

    const locations = await ctx.db
      .query("locations")
      .withIndex("by_user", (q) => q.eq("userId", partnerId))
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .order("desc")
      .take(1);

    return locations[0] || null;
  },
});

export const getMyLocation = query({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .order("desc")
      .take(1);

    return locations[0] || null;
  },
});

export const getSessionLocations = query({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.user1Id !== args.userId && session.user2Id !== args.userId) {
      throw new Error("Not authorized");
    }

    const limit = args.limit ?? 100;

    const locations = await ctx.db
      .query("locations")
      .withIndex("by_session_time", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(limit);

    return locations;
  },
});

export const cleanupOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const oldLocations = await ctx.db
      .query("locations")
      .filter((q) => q.lt(q.field("timestamp"), oneHourAgo))
      .collect();
    for (const loc of oldLocations) {
      await ctx.db.delete(loc._id);
    }
    return { deleted: oldLocations.length };
  },
});
