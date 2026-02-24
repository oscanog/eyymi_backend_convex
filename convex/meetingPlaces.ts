import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { type Doc, type Id } from "./_generated/dataModel";

const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_CHARS = 120;
const SEARCH_MAX_RESULTS = 8;
const SEARCH_TIMEOUT_MS = 6000;
const REMOVAL_REQUEST_TTL_MS = 5 * 60 * 1000;

type MeetingPlaceDoc = Doc<"sessionMeetingPlaces">;
type PlaceInput = {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  providerPlaceId?: string;
};

function getSearchBaseUrl(): string {
  return process.env.TOMTOM_SEARCH_BASE_URL?.trim() || "https://api.tomtom.com";
}

function getSearchApiKey(): string {
  return (
    process.env.TOMTOM_SEARCH_API_KEY?.trim() ||
    process.env.TOMTOM_ROUTING_API_KEY?.trim() ||
    ""
  );
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 6;
  }
  return Math.max(1, Math.min(Math.floor(limit), SEARCH_MAX_RESULTS));
}

export function normalizeMeetingSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validateMeetingSearchQuery(raw: string): {
  normalized: string;
  isSearchable: boolean;
  isTooLong: boolean;
} {
  const normalized = normalizeMeetingSearchQuery(raw);
  return {
    normalized,
    isSearchable: normalized.length >= SEARCH_MIN_CHARS,
    isTooLong: normalized.length > SEARCH_MAX_CHARS,
  };
}

function normalizeOptionalText(value: string | undefined, maxLen: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function normalizeMeetingPlace(input: PlaceInput): PlaceInput {
  const name = normalizeOptionalText(input.name, 120);
  if (!name || name.length < 2) {
    throw new ConvexError("Meeting place name must be at least 2 characters");
  }
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    throw new ConvexError("Meeting place latitude is invalid");
  }
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    throw new ConvexError("Meeting place longitude is invalid");
  }

  return {
    name,
    lat: input.lat,
    lng: input.lng,
    address: normalizeOptionalText(input.address, 240),
    providerPlaceId: normalizeOptionalText(input.providerPlaceId, 160),
  };
}

export function resolveMeetingPlaceStatus(
  status: "set" | "removal_requested",
  removalRequestExpiresAt: number | undefined,
  now: number
): "set" | "removal_requested" {
  if (status !== "removal_requested") return "set";
  const expiresAt = removalRequestExpiresAt ?? 0;
  return expiresAt > now ? "removal_requested" : "set";
}

function isRemovalRequestActive(place: MeetingPlaceDoc, now: number): boolean {
  if (place.status !== "removal_requested") return false;
  const expiresAt = place.removalRequestExpiresAt ?? 0;
  return expiresAt > now;
}

async function getSessionMeetingPlace(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"locationSessions">
) {
  const rows = await ctx.db
    .query("sessionMeetingPlaces")
    .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
    .take(1);
  return rows[0] ?? null;
}

async function getSessionAndVerifyParticipant(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"locationSessions">,
  userId: Id<"users">
) {
  const session = await ctx.db.get(sessionId);
  if (!session) {
    throw new ConvexError("Session not found");
  }
  if (session.user1Id !== userId && session.user2Id !== userId) {
    throw new ConvexError("Not authorized");
  }
  if (session.status === "closed") {
    throw new ConvexError("Session is closed");
  }
  return session;
}

async function resolveNameById(
  ctx: QueryCtx,
  userId: Id<"users"> | undefined
): Promise<string | null> {
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  const username = user?.username?.trim();
  return username?.length ? username : null;
}

function meetingPlaceResponse(
  place: MeetingPlaceDoc | null,
  now: number
): {
  status: "none" | "set" | "removal_requested";
  place: PlaceInput | null;
  setByUserId: Id<"users"> | null;
  removalRequestedBy: Id<"users"> | null;
  updatedAt: number | null;
  removalRequestExpiresAt: number | null;
} {
  if (!place) {
    return {
      status: "none",
      place: null,
      setByUserId: null,
      removalRequestedBy: null,
      updatedAt: null,
      removalRequestExpiresAt: null,
    };
  }

  const status = resolveMeetingPlaceStatus(place.status, place.removalRequestExpiresAt, now);
  const activeRemoval = status === "removal_requested";
  return {
    status,
    place: place.place,
    setByUserId: place.setByUserId,
    removalRequestedBy: activeRemoval ? place.removalRequestedBy ?? null : null,
    updatedAt: place.updatedAt,
    removalRequestExpiresAt: activeRemoval ? place.removalRequestExpiresAt ?? null : null,
  };
}

export const getForSession = query({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await getSessionAndVerifyParticipant(ctx, args.sessionId, args.userId);

    const now = Date.now();
    const doc = await getSessionMeetingPlace(ctx, args.sessionId);
    const response = meetingPlaceResponse(doc, now);
    const [setByUsername, removalRequestedByUsername] = await Promise.all([
      resolveNameById(ctx, response.setByUserId ?? undefined),
      resolveNameById(ctx, response.removalRequestedBy ?? undefined),
    ]);

    return {
      ...response,
      setByUsername,
      removalRequestedByUsername,
    };
  },
});

export const setMeetingPlace = mutation({
  args: {
    sessionId: v.id("locationSessions"),
    userId: v.id("users"),
    place: v.object({
      name: v.string(),
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
      providerPlaceId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await getSessionAndVerifyParticipant(ctx, args.sessionId, args.userId);
    const now = Date.now();
    const place = normalizeMeetingPlace(args.place);
    const existing = await getSessionMeetingPlace(ctx, args.sessionId);

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "set",
        place,
        setByUserId: args.userId,
        removalRequestedBy: undefined,
        removalRequestExpiresAt: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("sessionMeetingPlaces", {
        sessionId: args.sessionId,
        status: "set",
        place,
        setByUserId: args.userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.info("[meeting_places] set", {
      sessionId: args.sessionId,
      userId: args.userId,
      providerPlaceId: place.providerPlaceId ?? null,
    });

    return {
      status: "set" as const,
      place,
      setByUserId: args.userId,
      removalRequestedBy: null,
      updatedAt: now,
      removalRequestExpiresAt: null,
    };
  },
});

export const requestRemoval = mutation({
  args: {
    sessionId: v.id("locationSessions"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await getSessionAndVerifyParticipant(ctx, args.sessionId, args.userId);
    const now = Date.now();
    const existing = await getSessionMeetingPlace(ctx, args.sessionId);

    if (!existing) {
      throw new ConvexError("No meeting place is currently set");
    }

    const expiresAt = now + REMOVAL_REQUEST_TTL_MS;
    await ctx.db.patch(existing._id, {
      status: "removal_requested",
      removalRequestedBy: args.userId,
      removalRequestExpiresAt: expiresAt,
      updatedAt: now,
    });

    console.info("[meeting_places] removal_requested", {
      sessionId: args.sessionId,
      requestedBy: args.userId,
      expiresAt,
    });

    return {
      status: "removal_requested" as const,
      place: existing.place,
      setByUserId: existing.setByUserId,
      removalRequestedBy: args.userId,
      updatedAt: now,
      removalRequestExpiresAt: expiresAt,
    };
  },
});

export const respondRemoval = mutation({
  args: {
    sessionId: v.id("locationSessions"),
    userId: v.id("users"),
    accept: v.boolean(),
  },
  handler: async (ctx, args) => {
    await getSessionAndVerifyParticipant(ctx, args.sessionId, args.userId);
    const now = Date.now();
    const existing = await getSessionMeetingPlace(ctx, args.sessionId);

    if (!existing || !isRemovalRequestActive(existing, now)) {
      throw new ConvexError("No active removal request");
    }
    if (!existing.removalRequestedBy) {
      throw new ConvexError("Removal requester is missing");
    }
    if (existing.removalRequestedBy === args.userId) {
      throw new ConvexError("You cannot respond to your own removal request");
    }

    if (args.accept) {
      await ctx.db.delete(existing._id);
      console.info("[meeting_places] removal_accepted", {
        sessionId: args.sessionId,
        responderId: args.userId,
      });
      return {
        status: "none" as const,
        removed: true,
      };
    }

    await ctx.db.patch(existing._id, {
      status: "set",
      removalRequestedBy: undefined,
      removalRequestExpiresAt: undefined,
      updatedAt: now,
    });
    console.info("[meeting_places] removal_rejected", {
      sessionId: args.sessionId,
      responderId: args.userId,
    });
    return {
      status: "set" as const,
      removed: false,
      place: existing.place,
      setByUserId: existing.setByUserId,
    };
  },
});

export const cleanupExpiredRemovalRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("sessionMeetingPlaces")
      .withIndex("by_removalRequestExpiresAt", (q) =>
        q.lt("removalRequestExpiresAt", now)
      )
      .collect();

    let reset = 0;
    for (const doc of expired) {
      if (doc.status !== "removal_requested") continue;
      if ((doc.removalRequestExpiresAt ?? 0) > now) continue;

      await ctx.db.patch(doc._id, {
        status: "set",
        removalRequestedBy: undefined,
        removalRequestExpiresAt: undefined,
        updatedAt: now,
      });
      reset++;
    }

    if (reset > 0) {
      console.info("[meeting_places] expired_requests_reset", { count: reset });
    }
    return { reset };
  },
});

export const searchSuggestions = action({
  args: {
    sessionId: v.id("locationSessions"),
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const participantState = await ctx.runQuery(api.locationSessions.getParticipantState, {
      sessionId: args.sessionId,
      userId: args.userId,
    });
    if (!participantState?.exists || !participantState.isParticipant || participantState.status === "closed") {
      throw new ConvexError("Not authorized");
    }

    const queryValidation = validateMeetingSearchQuery(args.query);
    const normalizedQuery = queryValidation.normalized;
    if (!normalizedQuery) return [];
    if (!queryValidation.isSearchable) return [];
    if (queryValidation.isTooLong) {
      throw new ConvexError("Search query is too long");
    }

    const key = getSearchApiKey();
    if (!key) {
      throw new ConvexError("TOMTOM_SEARCH_API_KEY is not configured");
    }

    const limit = clampLimit(args.limit);
    const baseUrl = getSearchBaseUrl().replace(/\/+$/, "");
    const params = new URLSearchParams({
      key,
      limit: String(limit),
      language: "en-US",
      typeahead: "true",
    });
    const endpoint = `${baseUrl}/search/2/search/${encodeURIComponent(
      normalizedQuery
    )}.json?${params.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new ConvexError(`TomTom search failed (${response.status}): ${detail}`);
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const results = Array.isArray(payload.results) ? payload.results : [];
      const suggestions: PlaceInput[] = [];
      const seen = new Set<string>();

      for (const item of results) {
        const record = item as Record<string, unknown>;
        const poi = (record.poi ?? {}) as Record<string, unknown>;
        const address = (record.address ?? {}) as Record<string, unknown>;
        const position = (record.position ?? {}) as Record<string, unknown>;
        const lat = typeof position.lat === "number" ? position.lat : null;
        const lng = typeof position.lon === "number" ? position.lon : null;
        if (lat === null || lng === null) continue;

        const nameCandidate =
          typeof poi.name === "string"
            ? poi.name
            : typeof address.freeformAddress === "string"
              ? address.freeformAddress
              : typeof record.id === "string"
                ? record.id
                : "Selected place";
        const normalizedName = normalizeOptionalText(nameCandidate, 120);
        if (!normalizedName) continue;

        const providerPlaceId =
          typeof record.id === "string" ? normalizeOptionalText(record.id, 160) : undefined;
        const normalizedAddress =
          typeof address.freeformAddress === "string"
            ? normalizeOptionalText(address.freeformAddress, 240)
            : undefined;
        const dedupeKey = providerPlaceId ?? `${normalizedName}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        suggestions.push({
          name: normalizedName,
          lat,
          lng,
          address: normalizedAddress,
          providerPlaceId,
        });
      }

      return suggestions.slice(0, limit);
    } finally {
      clearTimeout(timeoutId);
    }
  },
});
