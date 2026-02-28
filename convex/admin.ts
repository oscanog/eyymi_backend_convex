import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { type Doc, type Id } from "./_generated/dataModel";

const DEPLOYMENT_KEY = "global";
export const DUMMY_COUNT = 40;
export const DUMMY_DURATION_MS = 10 * 60 * 1000;
const DUMMY_AVATAR_COUNT = 10;
const DUMMY_GENDER_BUCKET_SIZE = 10;
const DEFAULT_COPY_VISIBILITY_ENABLED = true;

export type DummyGender = "male" | "female" | "lesbian" | "gay";

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

export function buildDummyGender(slot: number): DummyGender {
  const normalizedSlot = ((Math.max(slot, 1) - 1) % DUMMY_COUNT) + 1;
  if (normalizedSlot <= DUMMY_GENDER_BUCKET_SIZE) return "male";
  if (normalizedSlot <= DUMMY_GENDER_BUCKET_SIZE * 2) return "female";
  if (normalizedSlot <= DUMMY_GENDER_BUCKET_SIZE * 3) return "lesbian";
  return "gay";
}

export function buildDummyAvatarId(slot: number): string {
  const avatarSlot = ((Math.max(slot, 1) - 1) % DUMMY_AVATAR_COUNT) + 1;
  return `copy-ava-${padSlot(avatarSlot)}`;
}

export function isDummyDeploymentActive(expiresAt: number | null | undefined, now: number): boolean {
  return typeof expiresAt === "number" && expiresAt > now;
}

export function resolveCopyVisibilityEnabled(value: boolean | null | undefined): boolean {
  return value ?? DEFAULT_COPY_VISIBILITY_ENABLED;
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
  copyVisibilityEnabled: boolean;
  users: DummyStatusUser[];
};

function toInactivePayload(copyVisibilityEnabled: boolean): DummyStatusPayload {
  return {
    isActive: false,
    startedAt: null,
    expiresAt: null,
    remainingMs: 0,
    copyVisibilityEnabled,
    users: [],
  };
}

async function getDeployment(ctx: { db: any }): Promise<Doc<"adminDummyDeployments"> | null> {
  return (await ctx.db
    .query("adminDummyDeployments")
    .withIndex("by_key", (q: any) => q.eq("key", DEPLOYMENT_KEY))
    .first()) as Doc<"adminDummyDeployments"> | null;
}

async function syncDummyMirrorQueueRows(args: {
  ctx: { db: any };
  deployment: Doc<"adminDummyDeployments"> | null;
  now: number;
}) {
  const { ctx, deployment, now } = args;
  const copyVisibilityEnabled = resolveCopyVisibilityEnabled(deployment?.copyVisibilityEnabled);
  const deploymentIsActive = Boolean(deployment && isDummyDeploymentActive(deployment.expiresAt, now));
  const deployedUserIds = new Set((deployment?.userIds ?? []).map((userId) => String(userId)));
  let touched = 0;

  const mirroredRows = await ctx.db
    .query("copyQueue")
    .withIndex("by_isAdminDummy_lastHeartbeatAt", (q: any) => q.eq("isAdminDummy", true))
    .collect();

  for (const row of mirroredRows) {
    const linkedUserId = row.linkedUserId ? String(row.linkedUserId) : null;
    const shouldStayActive =
      !!linkedUserId &&
      deployedUserIds.has(linkedUserId) &&
      deploymentIsActive &&
      copyVisibilityEnabled;

    if (shouldStayActive) continue;

    await ctx.db.patch(row._id, {
      isActive: false,
      queueStatus: "queued",
      targetQueueEntryId: undefined,
      activeMatchId: undefined,
      lastHeartbeatAt: now,
    });
    touched++;
  }

  if (!deployment || deployment.userIds.length === 0) {
    return touched;
  }

  for (let index = 0; index < deployment.userIds.length; index++) {
    const userId = deployment.userIds[index];
    const user = await ctx.db.get(userId);
    if (!user) continue;

    const slot = user.dummySlot ?? index + 1;
    const shouldBeActive = deploymentIsActive && copyVisibilityEnabled;
    const mirroredByLinkedUser = await ctx.db
      .query("copyQueue")
      .withIndex("by_linkedUserId", (q: any) => q.eq("linkedUserId", user._id))
      .collect();
    const primaryRow = mirroredByLinkedUser.sort((a: any, b: any) => b.joinedAt - a.joinedAt)[0] ?? null;
    const duplicateRows = primaryRow
      ? mirroredByLinkedUser.filter((row: any) => String(row._id) !== String(primaryRow._id))
      : [];

    for (const duplicate of duplicateRows) {
      await ctx.db.patch(duplicate._id, {
        isActive: false,
        queueStatus: "queued",
        targetQueueEntryId: undefined,
        activeMatchId: undefined,
        lastHeartbeatAt: now,
      });
      touched++;
    }

    const queuePatch = {
      participantKey: `admin_dummy_queue_${padSlot(slot)}`,
      profileUserId: user._id,
      linkedUserId: user._id,
      isAdminDummy: true,
      dummySlot: slot,
      username: user.username,
      avatarId: user.avatarId,
      gender: user.gender,
      preferredMatchGender: undefined,
      isActive: shouldBeActive,
      queueStatus: "queued" as const,
      targetQueueEntryId: undefined,
      activeMatchId: undefined,
      lastHeartbeatAt: now,
    };

    if (primaryRow) {
      await ctx.db.patch(primaryRow._id, queuePatch);
      touched++;
    } else {
      await ctx.db.insert("copyQueue", {
        ...queuePatch,
        joinedAt: now,
      });
      touched++;
    }
  }

  return touched;
}

async function buildDummyStatusPayload(args: {
  ctx: { db: any };
  deployment: Doc<"adminDummyDeployments"> | null;
  now: number;
}): Promise<DummyStatusPayload> {
  const { ctx, deployment, now } = args;
  const copyVisibilityEnabled = resolveCopyVisibilityEnabled(deployment?.copyVisibilityEnabled);
  if (!deployment || !isDummyDeploymentActive(deployment.expiresAt, now)) {
    return toInactivePayload(copyVisibilityEnabled);
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
    copyVisibilityEnabled,
    users,
  };
}

export const deployDummyUsers = mutation({
  args: {},
  returns: v.object({
    isActive: v.boolean(),
    startedAt: v.number(),
    expiresAt: v.number(),
    remainingMs: v.number(),
    copyVisibilityEnabled: v.boolean(),
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
      const gender = buildDummyGender(slot);
      const avatarId = buildDummyAvatarId(slot);
      const existing = await ctx.db
        .query("users")
        .withIndex("by_device", (q) => q.eq("deviceId", identity.deviceId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          username: identity.username,
          usernameKey: normalizeUsername(identity.username),
          gender,
          avatarId,
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
        gender,
        avatarId,
        isOnline: true,
        lastSeen: now,
        isAdminDummy: true,
        dummySlot: slot,
      });

      userIds.push(userId);
      users.push({ slot, userId: String(userId), username: identity.username });
    }

    const deployment = await getDeployment(ctx);
    const copyVisibilityEnabled = resolveCopyVisibilityEnabled(deployment?.copyVisibilityEnabled);
    if (deployment) {
      await ctx.db.patch(deployment._id, {
        userIds,
        startedAt: now,
        expiresAt,
        updatedAt: now,
        copyVisibilityEnabled,
      });
    } else {
      await ctx.db.insert("adminDummyDeployments", {
        key: DEPLOYMENT_KEY,
        userIds,
        startedAt: now,
        expiresAt,
        updatedAt: now,
        copyVisibilityEnabled,
      });
    }

    const updatedDeployment = await getDeployment(ctx);
    await syncDummyMirrorQueueRows({
      ctx,
      deployment: updatedDeployment,
      now,
    });
    const status = await buildDummyStatusPayload({
      ctx,
      deployment: updatedDeployment,
      now,
    });

    if (!status.isActive || status.startedAt === null || status.expiresAt === null) {
      throw new Error("Dummy deployment did not become active");
    }

    return {
      isActive: true,
      startedAt: status.startedAt,
      expiresAt: status.expiresAt,
      remainingMs: status.remainingMs,
      copyVisibilityEnabled: status.copyVisibilityEnabled,
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
    copyVisibilityEnabled: v.boolean(),
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
    const deployment = await getDeployment(ctx);
    return await buildDummyStatusPayload({
      ctx,
      deployment,
      now,
    });
  },
});

export const setCopyDummyVisibility = mutation({
  args: {
    enabled: v.boolean(),
  },
  returns: v.object({
    isActive: v.boolean(),
    startedAt: v.union(v.number(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
    remainingMs: v.number(),
    copyVisibilityEnabled: v.boolean(),
    users: v.array(
      v.object({
        slot: v.number(),
        userId: v.string(),
        username: v.string(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const deployment = await getDeployment(ctx);

    if (deployment) {
      await ctx.db.patch(deployment._id, {
        copyVisibilityEnabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("adminDummyDeployments", {
        key: DEPLOYMENT_KEY,
        userIds: [],
        startedAt: now,
        expiresAt: now,
        updatedAt: now,
        copyVisibilityEnabled: args.enabled,
      });
    }

    const updatedDeployment = await getDeployment(ctx);
    await syncDummyMirrorQueueRows({
      ctx,
      deployment: updatedDeployment,
      now,
    });

    return await buildDummyStatusPayload({
      ctx,
      deployment: updatedDeployment,
      now,
    });
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
    const deployment = await getDeployment(ctx);
    if (!deployment) {
      const queueTouched = await syncDummyMirrorQueueRows({
        ctx,
        deployment: null,
        now,
      });
      return { isActive: false, touched: queueTouched };
    }

    const isActive = isDummyDeploymentActive(deployment.expiresAt, now);
    let touched = 0;

    for (let index = 0; index < deployment.userIds.length; index++) {
      const userId = deployment.userIds[index];
      const user = await ctx.db.get(userId);
      if (!user) continue;
      const slot = user.dummySlot ?? index + 1;
      const identity = buildDummyIdentity(slot);
      const gender = buildDummyGender(slot);
      const avatarId = buildDummyAvatarId(slot);

      if (isActive) {
        await ctx.db.patch(user._id, {
          username: identity.username,
          usernameKey: normalizeUsername(identity.username),
          gender,
          avatarId,
          isOnline: true,
          lastSeen: now,
          isAdminDummy: true,
          dummySlot: slot,
        });
      } else {
        await ctx.db.patch(user._id, {
          username: identity.username,
          usernameKey: normalizeUsername(identity.username),
          gender,
          avatarId,
          isOnline: false,
          lastSeen: now,
          isAdminDummy: true,
          dummySlot: slot,
        });
      }
      touched += 1;
    }

    const queueTouched = await syncDummyMirrorQueueRows({
      ctx,
      deployment,
      now,
    });

    return { isActive, touched: touched + queueTouched };
  },
});
