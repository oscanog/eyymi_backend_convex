import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const CHAT_CONFIG = {
  MESSAGE_MAX_CHARS: 1000,
  MAX_MESSAGES_RETURNED: 120,
  TYPING_ACTIVE_MS: 3000,
  TYPING_ROW_TTL_MS: 10000,
  POST_SESSION_MESSAGE_GRACE_MS: 5 * 60 * 1000,
  DEFAULT_MESSAGE_TTL_MS: 15 * 60 * 1000,
};

function getEffectiveSessionStatus(session: any, now: number) {
  if (!session) return "missing" as const;
  if (session.status === "cancelled") return "cancelled" as const;
  if (session.status === "ended") return "ended" as const;
  if (session.endsAt <= now) return "ended" as const;
  return "active" as const;
}

function sanitizeMessageBody(input: string) {
  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  return normalized.slice(0, CHAT_CONFIG.MESSAGE_MAX_CHARS);
}

function canAccessSession(session: any, queueEntryId: string) {
  if (!session) return false;
  return (
    String(session.userAQueueEntryId) === String(queueEntryId) ||
    String(session.userBQueueEntryId) === String(queueEntryId)
  );
}

async function pruneExpiredRelayRows(ctx: any, now: number) {
  const db = ctx.db as any;
  const [expiredMessages, expiredTypingRows] = await Promise.all([
    db
      .query("soulGameChatMessages")
      .withIndex("by_expiresAt", (q: any) => q.lte("expiresAt", now))
      .collect(),
    db
      .query("soulGameChatTyping")
      .withIndex("by_expiresAt", (q: any) => q.lte("expiresAt", now))
      .collect(),
  ]);

  for (const row of expiredMessages) {
    await db.delete(row._id);
  }
  for (const row of expiredTypingRows) {
    await db.delete(row._id);
  }
}

export const getState = query({
  args: {
    sessionId: v.id("soulGameSessions"),
    queueEntryId: v.id("soulGameQueue"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const db = ctx.db as any;
    const session = await ctx.db.get(args.sessionId);

    if (!session || !canAccessSession(session, String(args.queueEntryId))) {
      return {
        serverNow: now,
        access: "denied" as const,
        errorCode: "SESSION_ACCESS_DENIED" as const,
        session: null,
        messages: [],
        typing: {
          selfIsTyping: false,
          partnerIsTyping: false,
          partnerLastTypingAt: null,
        },
      };
    }

    const effectiveStatus = getEffectiveSessionStatus(session, now);
    const partnerQueueEntryId =
      String(session.userAQueueEntryId) === String(args.queueEntryId)
        ? session.userBQueueEntryId
        : session.userAQueueEntryId;

    const [partnerQueue, messageRows, typingRows] = await Promise.all([
      ctx.db.get(partnerQueueEntryId),
      db
        .query("soulGameChatMessages")
        .withIndex("by_sessionId_createdAt", (q: any) => q.eq("sessionId", args.sessionId))
        .collect(),
      db
        .query("soulGameChatTyping")
        .withIndex("by_sessionId_queueEntryId", (q: any) => q.eq("sessionId", args.sessionId))
        .collect(),
    ]);

    const messages = messageRows
      .filter((row: any) => row.expiresAt > now)
      .sort((a: any, b: any) => a.createdAt - b.createdAt)
      .slice(-CHAT_CONFIG.MAX_MESSAGES_RETURNED)
      .map((row: any) => ({
        messageId: row._id,
        senderQueueEntryId: row.senderQueueEntryId,
        body: row.body,
        clientMessageId: row.clientMessageId ?? null,
        createdAt: row.createdAt,
      }));

    let selfTypingRow: any = null;
    let partnerTypingRow: any = null;
    for (const row of typingRows) {
      if (row.expiresAt <= now) continue;
      if (String(row.queueEntryId) === String(args.queueEntryId)) {
        if (!selfTypingRow || row.updatedAt > selfTypingRow.updatedAt) selfTypingRow = row;
      } else if (String(row.queueEntryId) === String(partnerQueueEntryId)) {
        if (!partnerTypingRow || row.updatedAt > partnerTypingRow.updatedAt) partnerTypingRow = row;
      }
    }

    const partnerIsTyping = Boolean(
      partnerTypingRow &&
      partnerTypingRow.isTyping &&
      now - partnerTypingRow.updatedAt <= CHAT_CONFIG.TYPING_ACTIVE_MS,
    );

    const selfIsTyping = Boolean(
      selfTypingRow &&
      selfTypingRow.isTyping &&
      now - selfTypingRow.updatedAt <= CHAT_CONFIG.TYPING_ACTIVE_MS,
    );

    return {
      serverNow: now,
      access: "ok" as const,
      errorCode: null,
      session: {
        sessionId: session._id,
        status: effectiveStatus,
        canChat: effectiveStatus === "active",
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        meQueueEntryId: args.queueEntryId,
        partnerQueueEntryId,
        partner: {
          username: partnerQueue?.username ?? null,
          avatarId: partnerQueue?.avatarId ?? null,
        },
      },
      messages,
      typing: {
        selfIsTyping,
        partnerIsTyping,
        partnerLastTypingAt: partnerTypingRow?.updatedAt ?? null,
      },
    };
  },
});

export const sendMessage = mutation({
  args: {
    sessionId: v.id("soulGameSessions"),
    queueEntryId: v.id("soulGameQueue"),
    body: v.string(),
    clientMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const db = ctx.db as any;
    await pruneExpiredRelayRows(ctx, now);

    const session = await ctx.db.get(args.sessionId);
    if (!session || !canAccessSession(session, String(args.queueEntryId))) {
      return {
        ok: false as const,
        reason: "session_access_denied" as const,
        serverNow: now,
      };
    }

    const effectiveStatus = getEffectiveSessionStatus(session, now);
    if (effectiveStatus !== "active") {
      return {
        ok: false as const,
        reason: "session_not_active" as const,
        serverNow: now,
      };
    }

    const body = sanitizeMessageBody(args.body);
    if (!body) {
      return {
        ok: false as const,
        reason: "empty_message" as const,
        serverNow: now,
      };
    }

    const expiresAt = Math.min(
      session.endsAt + CHAT_CONFIG.POST_SESSION_MESSAGE_GRACE_MS,
      now + CHAT_CONFIG.DEFAULT_MESSAGE_TTL_MS,
    );

    const messageId = await db.insert("soulGameChatMessages", {
      sessionId: args.sessionId,
      senderQueueEntryId: args.queueEntryId,
      body,
      clientMessageId: args.clientMessageId,
      createdAt: now,
      expiresAt,
    });

    const typingRows = await db
      .query("soulGameChatTyping")
      .withIndex("by_sessionId_queueEntryId", (q: any) =>
        q.eq("sessionId", args.sessionId).eq("queueEntryId", args.queueEntryId),
      )
      .collect();

    for (const row of typingRows) {
      await db.patch(row._id, {
        isTyping: false,
        updatedAt: now,
        expiresAt: now + CHAT_CONFIG.TYPING_ROW_TTL_MS,
      });
    }

    return {
      ok: true as const,
      messageId,
      serverNow: now,
    };
  },
});

export const setTyping = mutation({
  args: {
    sessionId: v.id("soulGameSessions"),
    queueEntryId: v.id("soulGameQueue"),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const db = ctx.db as any;
    await pruneExpiredRelayRows(ctx, now);

    const session = await ctx.db.get(args.sessionId);
    if (!session || !canAccessSession(session, String(args.queueEntryId))) {
      return {
        ok: false as const,
        reason: "session_access_denied" as const,
        serverNow: now,
      };
    }

    const effectiveStatus = getEffectiveSessionStatus(session, now);
    if (effectiveStatus !== "active") {
      return {
        ok: false as const,
        reason: "session_not_active" as const,
        serverNow: now,
      };
    }

    const rows = await db
      .query("soulGameChatTyping")
      .withIndex("by_sessionId_queueEntryId", (q: any) =>
        q.eq("sessionId", args.sessionId).eq("queueEntryId", args.queueEntryId),
      )
      .collect();

    const expiresAt = now + CHAT_CONFIG.TYPING_ROW_TTL_MS;

    if (rows.length === 0) {
      await db.insert("soulGameChatTyping", {
        sessionId: args.sessionId,
        queueEntryId: args.queueEntryId,
        isTyping: args.isTyping,
        updatedAt: now,
        expiresAt,
      });
    } else {
      const [primary, ...dupes] = rows.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
      await db.patch(primary._id, {
        isTyping: args.isTyping,
        updatedAt: now,
        expiresAt,
      });
      for (const row of dupes) {
        await db.delete(row._id);
      }
    }

    return {
      ok: true as const,
      serverNow: now,
    };
  },
});
