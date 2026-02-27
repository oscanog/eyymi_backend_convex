import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    deviceId: v.string(),
    username: v.string(),
    usernameKey: v.optional(v.string()),
    gender: v.optional(
      v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("gay"),
        v.literal("lesbian")
      )
    ),
    avatarId: v.optional(v.string()),
    isOnline: v.boolean(),
    lastSeen: v.number(),
    isAdminDummy: v.optional(v.boolean()),
    dummySlot: v.optional(v.number()),
  })
  .index("by_device", ["deviceId"])
  .index("by_usernameKey", ["usernameKey"])
  .index("by_lastSeen", ["lastSeen"]),

  adminDummyDeployments: defineTable({
    key: v.string(),
    userIds: v.array(v.id("users")),
    startedAt: v.number(),
    expiresAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  locationSessions: defineTable({
    code: v.string(), // 6 chars: A-Z, 0-9
    user1Id: v.id("users"),
    user2Id: v.optional(v.id("users")),
    status: v.union(
      v.literal("waiting"), 
      v.literal("active"), 
      v.literal("closed")
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
  .index("by_code", ["code"])
  .index("by_user1", ["user1Id"])
  .index("by_user2", ["user2Id"])
  .index("by_status_createdAt", ["status", "createdAt"])
  .index("by_expiresAt", ["expiresAt"]),

  locations: defineTable({
    sessionId: v.id("locationSessions"),
    userId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    timestamp: v.number(),
  })
  .index("by_session_time", ["sessionId", "timestamp"])
  .index("by_user", ["userId"]),

  sessionRoutes: defineTable({
    sessionId: v.id("locationSessions"),
    routeKey: v.optional(v.string()),
    routeOwnerUserId: v.optional(v.id("users")),
    destinationMode: v.optional(
      v.union(v.literal("partner"), v.literal("meeting_place"))
    ),
    destinationPlaceId: v.optional(v.string()),
    provider: v.union(v.literal("tomtom")),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("stale"),
      v.literal("error")
    ),
    polyline: v.optional(
      v.array(
        v.object({
          lat: v.number(),
          lng: v.number(),
        })
      )
    ),
    distanceMeters: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    trafficDurationSeconds: v.optional(v.number()),
    computedAt: v.number(),
    expiresAt: v.number(),
    origin: v.object({
      lat: v.number(),
      lng: v.number(),
      accuracy: v.optional(v.number()),
      timestamp: v.number(),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
      accuracy: v.optional(v.number()),
      timestamp: v.number(),
    }),
    geometryHash: v.optional(v.string()),
    lastError: v.optional(v.string()),
    errorAt: v.optional(v.number()),
    lockToken: v.optional(v.string()),
    lockExpiresAt: v.optional(v.number()),
    lastRequestedAt: v.optional(v.number()),
  })
  .index("by_session_routeKey", ["sessionId", "routeKey"])
  .index("by_sessionId", ["sessionId"])
  .index("by_expiresAt", ["expiresAt"]),

  sessionMeetingPlaces: defineTable({
    sessionId: v.id("locationSessions"),
    status: v.union(v.literal("set"), v.literal("removal_requested")),
    place: v.object({
      name: v.string(),
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
      providerPlaceId: v.optional(v.string()),
    }),
    setByUserId: v.id("users"),
    removalRequestedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
    removalRequestExpiresAt: v.optional(v.number()),
  })
  .index("by_sessionId", ["sessionId"])
  .index("by_removalRequestExpiresAt", ["removalRequestExpiresAt"]),

  sessionInvites: defineTable({
    requesterId: v.id("users"),
    recipientId: v.id("users"),
    pairKey: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("cancelled"),
      v.literal("expired")
    ),
    sessionId: v.optional(v.id("locationSessions")),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
  .index("by_requester", ["requesterId"])
  .index("by_recipient", ["recipientId"])
  .index("by_pair_status", ["pairKey", "status"])
  .index("by_expiresAt", ["expiresAt"]),

  authUsers: defineTable({
    phoneE164: v.string(),
    phoneVerifiedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("blocked"), v.literal("deleted")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
  .index("by_phoneE164", ["phoneE164"])
  .index("by_status", ["status"]),

  phoneOtpChallenges: defineTable({
    phoneE164: v.string(),
    otpCodeHash: v.string(),
    purpose: v.union(v.literal("signin"), v.literal("signup"), v.literal("reverify")),
    status: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("expired"),
      v.literal("failed"),
      v.literal("consumed")
    ),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    resendCount: v.number(),
    expiresAt: v.number(),
    verifiedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    providerMessageId: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
  .index("by_phone_createdAt", ["phoneE164", "createdAt"])
  .index("by_status", ["status"])
  .index("by_expiresAt", ["expiresAt"]),

  authSessions: defineTable({
    authUserId: v.id("authUsers"),
    refreshTokenHash: v.string(),
    deviceId: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
  .index("by_authUserId", ["authUserId"])
  .index("by_refreshTokenHash", ["refreshTokenHash"])
  .index("by_expiresAt", ["expiresAt"])
  .index("by_revokedAt", ["revokedAt"]),

  soulGameQueue: defineTable({
    participantKey: v.string(),
    authUserId: v.optional(v.string()),
    profileUserId: v.optional(v.string()),
    username: v.optional(v.string()),
    avatarId: v.optional(v.string()),
    isActive: v.boolean(),
    queueStatus: v.union(
      v.literal("queued"),
      v.literal("matching"),
      v.literal("matched")
    ),
    activeMatchId: v.optional(v.id("soulGameMatches")),
    joinedAt: v.number(),
    lastHeartbeatAt: v.number(),
    lastPressAt: v.optional(v.number()),
  })
  .index("by_participantKey", ["participantKey"])
  .index("by_isActive_lastHeartbeatAt", ["isActive", "lastHeartbeatAt"])
  .index("by_activeMatchId", ["activeMatchId"]),

  soulGamePressEvents: defineTable({
    queueEntryId: v.id("soulGameQueue"),
    participantKey: v.string(),
    pressStartedAt: v.number(),
    pressEndedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("matched"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
    matchId: v.optional(v.id("soulGameMatches")),
    createdAt: v.number(),
  })
  .index("by_queueEntry_status", ["queueEntryId", "status"])
  .index("by_status_startedAt", ["status", "pressStartedAt"])
  .index("by_matchId", ["matchId"]),

  soulGameMatches: defineTable({
    userAQueueEntryId: v.id("soulGameQueue"),
    userBQueueEntryId: v.id("soulGameQueue"),
    userAPressEventId: v.id("soulGamePressEvents"),
    userBPressEventId: v.id("soulGamePressEvents"),
    matchWindowStart: v.number(),
    matchWindowEnd: v.number(),
    overlapMs: v.number(),
    createdAt: v.number(),
    status: v.union(
      v.literal("pending_intro"),
      v.literal("active_2min"),
      v.literal("ended"),
      v.literal("cancelled")
    ),
    conversationEndsAt: v.optional(v.number()),
    sessionId: v.optional(v.id("soulGameSessions")),
  })
  .index("by_status_createdAt", ["status", "createdAt"])
  .index("by_userAQueueEntryId", ["userAQueueEntryId"])
  .index("by_userBQueueEntryId", ["userBQueueEntryId"])
  .index("by_conversationEndsAt", ["conversationEndsAt"]),

  soulGameSessions: defineTable({
    matchId: v.id("soulGameMatches"),
    userAQueueEntryId: v.id("soulGameQueue"),
    userBQueueEntryId: v.id("soulGameQueue"),
    startedAt: v.number(),
    endsAt: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("ended"),
      v.literal("cancelled")
    ),
  })
  .index("by_matchId", ["matchId"])
  .index("by_endsAt", ["endsAt"])
  .index("by_userAQueueEntryId", ["userAQueueEntryId"])
  .index("by_userBQueueEntryId", ["userBQueueEntryId"]),

  // Ephemeral relay for Soul Game chat. These rows are short-lived and can be pruned.
  soulGameChatMessages: defineTable({
    sessionId: v.id("soulGameSessions"),
    senderQueueEntryId: v.id("soulGameQueue"),
    body: v.string(),
    clientMessageId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
  .index("by_sessionId_createdAt", ["sessionId", "createdAt"])
  .index("by_expiresAt", ["expiresAt"]),

  soulGameChatTyping: defineTable({
    sessionId: v.id("soulGameSessions"),
    queueEntryId: v.id("soulGameQueue"),
    isTyping: v.boolean(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  })
  .index("by_sessionId_queueEntryId", ["sessionId", "queueEntryId"])
  .index("by_expiresAt", ["expiresAt"]),
});
