import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { type Id } from "./_generated/dataModel";

const DEPLOYMENT_KEY = "global";
export const DUMMY_COUNT = 10;
export const DUMMY_DURATION_MS = 10 * 60 * 1000;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function padSlot(slot: number): string {
  return slot.toString().padStart(2, "0");
}

export function buildDummyIdentity(slot: number): { deviceId: string; username: string } {
  const suffix = padSlot(slot);
  return {
    deviceId: `admin_dummy_device_${suffix}`,
    username: `dummy_user_${suffix}`,
  };
}

export function isDummyDeploymentActive(expiresAt: number | null | undefined, now: number): boolean {
  return typeof expiresAt === "number" && expiresAt > now;
}

type DummyStatusUser = {
  slot: number;
  userId: string;
  username: string;
};

type DummyStatusPayload = {
  isActive: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  remainingMs: number;
  users: DummyStatusUser[];
};

function toInactivePayload(): DummyStatusPayload {
  return {
    isActive: false,
    startedAt: null,
    expiresAt: null,
    remainingMs: 0,
    users: [],
  };
}

export const deployDummyUsers = mutation({
  args: {},
  returns: v.object({
    isActive: v.boolean(),
    startedAt: v.number(),
    expiresAt: v.number(),
    remainingMs: v.number(),
    users: v.array(
      v.object({
        slot: v.number(),
        userId: v.string(),
        username: v.string(),
      })
    ),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const expiresAt = now + DUMMY_DURATION_MS;

    const userIds: Id<"users">[] = [];
    const users: DummyStatusUser[] = [];

    for (let slot = 1; slot <= DUMMY_COUNT; slot++) {
      const identity = buildDummyIdentity(slot);
      const existing = await ctx.db
        .query("users")
        .withIndex("by_device", (q) => q.eq("deviceId", identity.deviceId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          username: identity.username,
          usernameKey: normalizeUsername(identity.username),
          isOnline: true,
          lastSeen: now,
          isAdminDummy: true,
          dummySlot: slot,
        });
        userIds.push(existing._id);
        users.push({ slot, userId: String(existing._id), username: identity.username });
        continue;
      }

      const userId = await ctx.db.insert("users", {
        deviceId: identity.deviceId,
        username: identity.username,
        usernameKey: normalizeUsername(identity.username),
        isOnline: true,
        lastSeen: now,
        isAdminDummy: true,
        dummySlot: slot,
      });

      userIds.push(userId);
      users.push({ slot, userId: String(userId), username: identity.username });
    }

    const deployment = await ctx.db
      .query("adminDummyDeployments")
      .withIndex("by_key", (q) => q.eq("key", DEPLOYMENT_KEY))
      .first();
    if (deployment) {
      await ctx.db.patch(deployment._id, {
        userIds,
        startedAt: now,
        expiresAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("adminDummyDeployments", {
        key: DEPLOYMENT_KEY,
        userIds,
        startedAt: now,
        expiresAt,
        updatedAt: now,
      });
    }

    return {
      isActive: true,
      startedAt: now,
      expiresAt,
      remainingMs: DUMMY_DURATION_MS,
      users,
    };
  },
});

export const getDummyUsersStatus = query({
  args: {},
  returns: v.object({
    isActive: v.boolean(),
    startedAt: v.union(v.number(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
    remainingMs: v.number(),
    users: v.array(
      v.object({
        slot: v.number(),
        userId: v.string(),
        username: v.string(),
      })
    ),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const deployment = await ctx.db
      .query("adminDummyDeployments")
      .withIndex("by_key", (q) => q.eq("key", DEPLOYMENT_KEY))
      .first();
    if (!deployment || !isDummyDeploymentActive(deployment.expiresAt, now)) {
      return toInactivePayload();
    }

    const fetchedUsers = await Promise.all(
      deployment.userIds.map(async (userId, index) => {
        const user = await ctx.db.get(userId);
        if (!user) return null;

        return {
          slot: user.dummySlot ?? index + 1,
          userId: String(user._id),
          username: user.username,
        };
      })
    );

    const users = fetchedUsers
      .filter((user): user is DummyStatusUser => user !== null)
      .sort((a, b) => a.slot - b.slot);

    return {
      isActive: true,
      startedAt: deployment.startedAt,
      expiresAt: deployment.expiresAt,
      remainingMs: Math.max(0, deployment.expiresAt - now),
      users,
    };
  },
});

export const syncDummyUsersLifecycle = internalMutation({
  args: {},
  returns: v.object({
    isActive: v.boolean(),
    touched: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const deployment = await ctx.db
      .query("adminDummyDeployments")
      .withIndex("by_key", (q) => q.eq("key", DEPLOYMENT_KEY))
      .first();
    if (!deployment) {
      return { isActive: false, touched: 0 };
    }

    const isActive = isDummyDeploymentActive(deployment.expiresAt, now);
    let touched = 0;

    for (let index = 0; index < deployment.userIds.length; index++) {
      const userId = deployment.userIds[index];
      const user = await ctx.db.get(userId);
      if (!user) continue;

      if (isActive) {
        await ctx.db.patch(user._id, {
          isOnline: true,
          lastSeen: now,
          isAdminDummy: true,
          dummySlot: user.dummySlot ?? index + 1,
        });
      } else {
        await ctx.db.patch(user._id, {
          isOnline: false,
          lastSeen: now,
          isAdminDummy: true,
          dummySlot: user.dummySlot ?? index + 1,
        });
      }
      touched += 1;
    }

    return { isActive, touched };
  },
});
