import { ConvexError, v } from "convex/values";
import { query, mutation, internalMutation, type QueryCtx } from "./_generated/server";
import { type Doc, type Id } from "./_generated/dataModel";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const INACTIVE_USER_CLEANUP_MS = 5 * 60 * 1000;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;

function buildUsernameInUseError(requestedUsername: string, suggestion: string): ConvexError<{
  code: "USERNAME_IN_USE";
  requestedUsername: string;
  suggestion: string;
  message: string;
}> {
  return new ConvexError({
    code: "USERNAME_IN_USE",
    requestedUsername,
    suggestion,
    message: "Username is currently active. Please pick another one.",
  });
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function sanitizeUsername(username: string): string {
  return username.trim().replace(/\s+/g, " ").slice(0, USERNAME_MAX_LENGTH);
}

function isUserActive(user: Doc<"users">, now: number): boolean {
  return user.isOnline && user.lastSeen >= now - ONLINE_WINDOW_MS;
}

type ReadCtx = Pick<QueryCtx, "db">;

async function getUsersByUsernameKey(ctx: ReadCtx, usernameKey: string): Promise<Doc<"users">[]> {
  const indexed = await ctx.db
    .query("users")
    .withIndex("by_usernameKey", (q) => q.eq("usernameKey", usernameKey))
    .collect();

  if (indexed.length > 0) {
    return indexed;
  }

  // Legacy fallback for rows created before usernameKey existed.
  const allUsers = await ctx.db.query("users").collect();
  return allUsers.filter((user: Doc<"users">) => normalizeUsername(user.username) === usernameKey);
}

async function findActiveUsernameClaimant(
  ctx: ReadCtx,
  usernameKey: string,
  now: number,
  excludeUserId?: Id<"users">
): Promise<Doc<"users"> | null> {
  const matches = await getUsersByUsernameKey(ctx, usernameKey);
  return (
    matches.find((user) => {
      if (excludeUserId && user._id === excludeUserId) return false;
      return isUserActive(user, now);
    }) ?? null
  );
}

async function generateUsernameSuggestion(
  ctx: ReadCtx,
  preferredUsername: string,
  now: number
): Promise<string> {
  const compactBase = preferredUsername.replace(/[^a-zA-Z0-9]/g, "").slice(0, 14) || "user";

  for (let attempt = 0; attempt < 24; attempt++) {
    const suffix = Math.floor(100 + Math.random() * 900).toString();
    const candidate = `${compactBase}${suffix}`.slice(0, USERNAME_MAX_LENGTH);
    const claimant = await findActiveUsernameClaimant(ctx, normalizeUsername(candidate), now);
    if (!claimant) {
      return candidate;
    }
  }

  return `${compactBase}${String(now).slice(-3)}`.slice(0, USERNAME_MAX_LENGTH);
}

async function hasBlockingUserRelations(
  ctx: ReadCtx,
  userId: Id<"users">,
  now: number
): Promise<boolean> {
  const [hostSessions, guestSessions, outgoingInvites, incomingInvites] = await Promise.all([
    ctx.db
      .query("locationSessions")
      .withIndex("by_user1", (q) => q.eq("user1Id", userId))
      .collect(),
    ctx.db
      .query("locationSessions")
      .withIndex("by_user2", (q) => q.eq("user2Id", userId))
      .collect(),
    ctx.db
      .query("sessionInvites")
      .withIndex("by_requester", (q) => q.eq("requesterId", userId))
      .collect(),
    ctx.db
      .query("sessionInvites")
      .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
      .collect(),
  ]);

  const hasActiveSession = [...hostSessions, ...guestSessions].some(
    (session) =>
      (session.status === "waiting" || session.status === "active") &&
      session.expiresAt > now
  );

  if (hasActiveSession) {
    return true;
  }

  const hasPendingInvite = [...outgoingInvites, ...incomingInvites].some(
    (invite) => invite.status === "pending" && invite.expiresAt > now
  );

  return hasPendingInvite;
}

/**
 * Create or update a user on app launch
 * Called when user opens app with their deviceId and username
 */
export const upsert = mutation({
  args: {
    deviceId: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const username = sanitizeUsername(args.username);

    if (username.length < USERNAME_MIN_LENGTH) {
      throw new ConvexError({
        code: "INVALID_USERNAME",
        message: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
      });
    }

    const usernameKey = normalizeUsername(username);

    // Check if user exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .first();

    if (existing) {
      const existingKey = existing.usernameKey ?? normalizeUsername(existing.username);
      if (existingKey !== usernameKey) {
        const activeClaimant = await findActiveUsernameClaimant(ctx, usernameKey, now, existing._id);

        if (activeClaimant) {
          const suggestion = await generateUsernameSuggestion(ctx, username, now);
          console.warn("[users.upsert] username conflict", {
            requestedUsername: username,
            normalizedUsername: usernameKey,
            suggestion,
            claimantId: activeClaimant._id,
            deviceId: args.deviceId,
          });
          throw buildUsernameInUseError(username, suggestion);
        }
      }

      // Update last seen and online status
      await ctx.db.patch(existing._id, {
        username,
        usernameKey,
        isOnline: true,
        lastSeen: now,
      });
      // Return the updated user
      return await ctx.db.get(existing._id);
    }

    const activeClaimant = await findActiveUsernameClaimant(ctx, usernameKey, now);

    if (activeClaimant) {
      const suggestion = await generateUsernameSuggestion(ctx, username, now);
      console.warn("[users.upsert] username conflict", {
        requestedUsername: username,
        normalizedUsername: usernameKey,
        suggestion,
        claimantId: activeClaimant._id,
        deviceId: args.deviceId,
      });
      throw buildUsernameInUseError(username, suggestion);
    }

    // Create new user
    const newUserId = await ctx.db.insert("users", {
      deviceId: args.deviceId,
      username,
      usernameKey,
      isOnline: true,
      lastSeen: now,
    });
    // Return the created user
    return await ctx.db.get(newUserId);
  },
});

/**
 * Get user by deviceId
 */
export const getByDevice = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .first();
  },
});

/**
 * Get user by ID
 */
export const get = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    try {
      const id = args.userId as import("./_generated/dataModel").Id<"users">;
      return await ctx.db.get(id);
    } catch {
      return null;
    }
  },
});

/**
 * Heartbeat - update lastSeen and online status
 * Called periodically while app is active
 */
export const heartbeat = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .first();

    if (!user) return null;

    await ctx.db.patch(user._id, {
      isOnline: true,
      lastSeen: Date.now(),
      usernameKey: user.usernameKey ?? normalizeUsername(user.username),
    });

    return user._id;
  },
});

/**
 * Mark user as offline
 * Called when app goes to background or closes
 */
export const setOffline = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .first();

    if (!user) return null;

    await ctx.db.patch(user._id, {
      isOnline: false,
      lastSeen: Date.now(),
    });

    return user._id;
  },
});

/**
 * Get all online users
 * Returns users seen within the last 2 minutes, sorted by lastSeen descending
 * Uses lastSeen recency instead of trusting isOnline boolean alone
 */
export const getOnlineUsers = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const twoMinutesAgo = now - ONLINE_WINDOW_MS;

    const users = await ctx.db
      .query("users")
      .filter((q) =>
        q.and(
          q.eq(q.field("isOnline"), true),
          q.gte(q.field("lastSeen"), twoMinutesAgo)
        )
      )
      .collect();

    // Sort by lastSeen descending (most recently active first)
    return users.sort((a, b) => b.lastSeen - a.lastSeen);
  },
});

/**
 * INTERNAL: Mark users offline if not seen in 2 minutes
 * Called by cron job every minute
 */
export const markStaleOffline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const hasAnyUser = await ctx.db.query("users").first();
    if (!hasAnyUser) {
      return { skipped: true, reason: "no_users", markedOffline: 0 };
    }

    const twoMinutesAgo = Date.now() - ONLINE_WINDOW_MS;

    const staleOnline = await ctx.db
      .query("users")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", twoMinutesAgo))
      .filter((q) => q.eq(q.field("isOnline"), true))
      .collect();

    for (const user of staleOnline) {
      await ctx.db.patch(user._id, { isOnline: false });
    }

    return { skipped: false, markedOffline: staleOnline.length };
  },
});

/**
 * INTERNAL: Cleanup users inactive for 5 minutes.
 * Deletes only users with no active session/invite relations.
 */
export const cleanupInactiveUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const hasAnyUser = await ctx.db.query("users").first();
    if (!hasAnyUser) {
      return { skipped: true, reason: "no_users", deleted: 0, blocked: 0 };
    }

    const now = Date.now();
    const cutoff = now - INACTIVE_USER_CLEANUP_MS;

    const inactiveCandidates = await ctx.db
      .query("users")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", cutoff))
      .collect();

    let deleted = 0;
    let blocked = 0;

    for (const user of inactiveCandidates) {
      const isInactive = user.lastSeen < cutoff || user.isOnline === false;
      if (!isInactive) {
        continue;
      }

      const hasRelations = await hasBlockingUserRelations(ctx, user._id, now);
      if (hasRelations) {
        blocked++;
        continue;
      }

      await ctx.db.delete(user._id);
      deleted++;
    }

    return { skipped: false, deleted, blocked };
  },
});
