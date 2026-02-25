import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByMatch = query({
  args: { matchId: v.id("soulGameMatches") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("soulGameSessions")
      .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
      .first();
  },
});

export const endExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("soulGameSessions")
      .withIndex("by_endsAt", (q) => q.lte("endsAt", now))
      .collect();

    let endedCount = 0;
    for (const session of sessions) {
      if (session.status === "active") {
        await ctx.db.patch(session._id, { status: "ended" });
        const match = await ctx.db.get(session.matchId);
        if (match && match.status !== "ended") {
          await ctx.db.patch(match._id, { status: "ended" });
        }
        endedCount++;
      }
    }
    return { endedCount };
  },
});

