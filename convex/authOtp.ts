import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEV_FAKE_PHONE_E164 = "+639948235631";
const PROD_DEPLOYMENT_NAMES = new Set(["tacit-woodpecker-977"]);

type OtpPurpose = "signin" | "signup" | "reverify";

function readBooleanEnv(name: string): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function shouldDebugLogOtpCodes(): boolean {
  // Explicit flag only. Set this in Convex *dev* deployment env vars, never in prod.
  const debugRequested = readBooleanEnv("OTP_DEBUG_LOG_CODES");
  if (!debugRequested) return false;

  const deploymentName = (process.env.CONVEX_DEPLOYMENT ?? "").trim();
  if (PROD_DEPLOYMENT_NAMES.has(deploymentName)) {
    console.warn("[otp] OTP_DEBUG_LOG_CODES ignored for production deployment", {
      deploymentName,
    });
    return false;
  }

  return true;
}

function normalizePhoneInput(raw: string): string {
  const cleaned = raw.trim().replace(/[\s()-]/g, "");
  if (!cleaned) {
    throw new ConvexError("Phone number is required");
  }

  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (!/^\d{10,15}$/.test(digits)) {
      throw new ConvexError("Phone number format is invalid");
    }
    return `+${digits}`;
  }

  const digits = cleaned.replace(/\D/g, "");

  // Philippines defaults / robust local handling:
  // 09948235631 -> +639948235631
  // 9948235631 -> +639948235631
  // 639948235631 -> +639948235631
  if (/^09\d{9}$/.test(digits)) {
    return `+63${digits.slice(1)}`;
  }
  if (/^9\d{9}$/.test(digits)) {
    return `+63${digits}`;
  }
  if (/^63\d{10}$/.test(digits)) {
    return `+${digits}`;
  }

  throw new ConvexError("Only valid mobile phone numbers are supported");
}

function randomDigits(length: number): string {
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String(buf[i] % 10);
  }
  return out;
}

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function otpPepper(): string {
  return process.env.OTP_HASH_PEPPER?.trim() || "eyymi-dev-otp-pepper-change-me";
}

function normalizeOtpPurpose(purpose: OtpPurpose): OtpPurpose {
  if (purpose === "signin" || purpose === "signup" || purpose === "reverify") return purpose;
  throw new ConvexError("Invalid OTP purpose");
}

function canUseExistingAccountForSignup(status: "active" | "blocked" | "deleted"): boolean {
  // Keep signup strict for active/blocked accounts. Deleted accounts can be re-created/recovered later
  // under a dedicated recovery flow instead of the regular signup path.
  return status === "deleted";
}

export const requestCode = mutation({
  args: {
    phone: v.string(),
    purpose: v.union(v.literal("signin"), v.literal("signup"), v.literal("reverify")),
    deviceId: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const phoneE164 = normalizePhoneInput(args.phone);
    const purpose = normalizeOtpPurpose(args.purpose);
    const now = Date.now();

    const latest = await ctx.db
      .query("phoneOtpChallenges")
      .withIndex("by_phone_createdAt", (q) => q.eq("phoneE164", phoneE164))
      .order("desc")
      .take(1);

    const lastChallenge = latest[0] ?? null;
    if (lastChallenge && now - lastChallenge.createdAt < OTP_RESEND_COOLDOWN_MS) {
      throw new ConvexError(`Please wait before requesting another code`);
    }

    const code = randomDigits(OTP_LENGTH);
    const otpCodeHash = await sha256Hex(`${phoneE164}:${code}:${otpPepper()}`);
    const expiresAt = now + OTP_EXPIRY_MS;

    const challengeId = await ctx.db.insert("phoneOtpChallenges", {
      phoneE164,
      otpCodeHash,
      purpose,
      status: "pending",
      attemptCount: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      resendCount: lastChallenge ? (lastChallenge.resendCount ?? 0) + 1 : 0,
      expiresAt,
      ipAddress: args.ipAddress?.trim() || undefined,
      deviceId: args.deviceId?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    const existingUser = await ctx.db
      .query("authUsers")
      .withIndex("by_phoneE164", (q) => q.eq("phoneE164", phoneE164))
      .first();

    if (purpose === "signin" && !existingUser) {
      throw new ConvexError("No account found for this phone number. Please sign up first.");
    }

    if (
      purpose === "signup" &&
      existingUser &&
      !canUseExistingAccountForSignup(existingUser.status)
    ) {
      throw new ConvexError("This phone number is already registered. Please sign in instead.");
    }

    if (shouldDebugLogOtpCodes()) {
      // DEV ONLY: log OTP for local testing. Never log OTP codes in production.
      console.info("[otp.dev] challenge_created", {
        phoneE164,
        code,
        challengeId,
        purpose,
        fakeNumberMatch: phoneE164 === DEV_FAKE_PHONE_E164,
      });
    } else {
      // TODO(twilio): send OTP SMS here via Twilio Verify or Messaging API
      console.info("[otp] challenge created (provider integration pending)", {
        phoneE164,
        challengeId,
        purpose,
      });
    }

    return {
      challengeId,
      expiresAt,
      resendAvailableAt: now + OTP_RESEND_COOLDOWN_MS,
      otpLength: OTP_LENGTH,
      accountExists: Boolean(existingUser),
      normalizedPhoneE164: phoneE164,
    };
  },
});

export const verifyCode = mutation({
  args: {
    challengeId: v.id("phoneOtpChallenges"),
    code: v.string(),
    deviceId: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const challenge = await ctx.db.get(args.challengeId);

    if (!challenge) {
      throw new ConvexError("OTP challenge not found");
    }

    if (challenge.status !== "pending") {
      throw new ConvexError("OTP challenge is no longer valid");
    }

    if (challenge.expiresAt <= now) {
      await ctx.db.patch(challenge._id, {
        status: "expired",
        updatedAt: now,
      });
      throw new ConvexError("OTP has expired");
    }

    const submittedCode = args.code.trim();
    if (!/^\d{6}$/.test(submittedCode)) {
      throw new ConvexError("OTP code must be 6 digits");
    }

    const computedHash = await sha256Hex(`${challenge.phoneE164}:${submittedCode}:${otpPepper()}`);
    if (computedHash !== challenge.otpCodeHash) {
      const nextAttemptCount = challenge.attemptCount + 1;
      const failedStatus = nextAttemptCount >= challenge.maxAttempts ? "failed" : "pending";
      await ctx.db.patch(challenge._id, {
        attemptCount: nextAttemptCount,
        status: failedStatus,
        updatedAt: now,
      });
      if (failedStatus === "failed") {
        throw new ConvexError("Too many OTP attempts");
      }
      throw new ConvexError("Invalid OTP code");
    }

    let authUser = await ctx.db
      .query("authUsers")
      .withIndex("by_phoneE164", (q) => q.eq("phoneE164", challenge.phoneE164))
      .first();

    if (challenge.purpose === "signin" && !authUser) {
      throw new ConvexError("No account found for this phone number. Please sign up first.");
    }

    if (
      challenge.purpose === "signup" &&
      authUser &&
      !canUseExistingAccountForSignup(authUser.status)
    ) {
      throw new ConvexError("This phone number is already registered. Please sign in instead.");
    }

    const isNewUser = !authUser;

    if (!authUser) {
      const authUserId = await ctx.db.insert("authUsers", {
        phoneE164: challenge.phoneE164,
        phoneVerifiedAt: now,
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      });
      authUser = await ctx.db.get(authUserId);
    } else {
      await ctx.db.patch(authUser._id, {
        phoneVerifiedAt: now,
        status: authUser.status === "deleted" ? "active" : authUser.status,
        updatedAt: now,
        lastLoginAt: now,
      });
      authUser = await ctx.db.get(authUser._id);
    }

    if (!authUser) {
      throw new ConvexError("Failed to create auth user");
    }
    if (authUser.status !== "active") {
      throw new ConvexError("Account is not active");
    }

    const rawRefreshToken = randomHex(32);
    const refreshTokenHash = await sha256Hex(`refresh:${rawRefreshToken}:${otpPepper()}`);
    const sessionExpiresAt = now + AUTH_SESSION_TTL_MS;

    await ctx.db.insert("authSessions", {
      authUserId: authUser._id,
      refreshTokenHash,
      deviceId: args.deviceId?.trim() || challenge.deviceId || undefined,
      platform: args.platform?.trim() || undefined,
      appVersion: args.appVersion?.trim() || undefined,
      ipAddress: args.ipAddress?.trim() || challenge.ipAddress || undefined,
      userAgent: args.userAgent?.trim() || undefined,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: sessionExpiresAt,
    });

    await ctx.db.patch(challenge._id, {
      status: "consumed",
      verifiedAt: now,
      consumedAt: now,
      updatedAt: now,
    });

    return {
      sessionToken: rawRefreshToken,
      expiresAt: sessionExpiresAt,
      authUser: {
        _id: authUser._id,
        phoneE164: authUser.phoneE164,
        phoneVerifiedAt: authUser.phoneVerifiedAt,
        status: authUser.status,
      },
      isNewUser,
    };
  },
});
