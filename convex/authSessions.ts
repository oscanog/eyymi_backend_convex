import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function otpPepper(): string {
  return process.env.OTP_HASH_PEPPER?.trim() || "eyymi-dev-otp-pepper-change-me";
}

type ReadWriteCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function findSessionByRawToken(ctx: ReadWriteCtx, sessionToken: string) {
  const refreshTokenHash = await sha256Hex(`refresh:${sessionToken}:${otpPepper()}`);
  return await ctx.db
    .query("authSessions")
    .withIndex("by_refreshTokenHash", (q) => q.eq("refreshTokenHash", refreshTokenHash))
    .first();
}

export const getCurrent = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rawToken = args.sessionToken.trim();
    if (!rawToken) return null;

    const session = await findSessionByRawToken(ctx, rawToken);
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt <= now) return null;

    const authUser = await ctx.db.get(session.authUserId);
    if (!authUser || authUser.status !== "active") return null;

    return {
      session: {
        _id: session._id,
        authUserId: session.authUserId,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt ?? null,
      },
      authUser: {
        _id: authUser._id,
        phoneE164: authUser.phoneE164,
        phoneVerifiedAt: authUser.phoneVerifiedAt,
        status: authUser.status,
      },
    };
  },
});

export const touch = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await findSessionByRawToken(ctx, args.sessionToken.trim());
    if (!session) return { ok: false, reason: "not_found" as const };
    if (session.revokedAt) return { ok: false, reason: "revoked" as const };
    if (session.expiresAt <= now) return { ok: false, reason: "expired" as const };

    await ctx.db.patch(session._id, { lastSeenAt: now });
    return { ok: true as const };
  },
});

export const logout = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await findSessionByRawToken(ctx, args.sessionToken.trim());
    if (!session) {
      return { ok: true as const };
    }
    if (!session.revokedAt) {
      await ctx.db.patch(session._id, { revokedAt: Date.now() });
    }
    return { ok: true as const };
  },
});

export const refresh = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async () => {
    // TODO(twilio/auth): Implement refresh token rotation before production auth launch.
    throw new ConvexError("Refresh token rotation is not implemented yet");
  },
});
