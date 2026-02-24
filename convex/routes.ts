import { v } from "convex/values";
import { action, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { type Doc, type Id } from "./_generated/dataModel";

const PROVIDER = "tomtom" as const;
const PAIR_ROUTE_KEY = "pair";

const LOCATION_FRESHNESS_MS = 20_000;
const ROUTE_TTL_MS = 45_000;
const FALLBACK_GRACE_MS = 90_000;
const MIN_RECOMPUTE_INTERVAL_MS = 12_000;
const MOVEMENT_THRESHOLD_METERS = 25;
const ETA_HYSTERESIS_SECONDS = 20;
const FORCE_REPLACE_STALE_MS = 50_000;
const LOCK_TTL_MS = 12_000;
const REQUEST_TIMEOUT_MS = 6_000;
const ERROR_RETRY_AFTER_MS = 8_000;

type RouteStatus = "pending" | "ready" | "stale" | "error";
type DestinationMode = "partner" | "meeting_place";

type RoutePoint = {
  lat: number;
  lng: number;
};

type Endpoint = {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: number;
};

type RouteSnapshot = {
  routeKey?: string;
  routeOwnerUserId?: Id<"users"> | null;
  destinationMode?: DestinationMode;
  destinationPlaceId?: string;
  status: RouteStatus;
  polyline?: RoutePoint[];
  distanceMeters?: number;
  durationSeconds?: number;
  trafficDurationSeconds?: number;
  computedAt: number;
  expiresAt: number;
  origin: Endpoint;
  destination: Endpoint;
  geometryHash?: string;
  lastError?: string;
  lockToken?: string;
  lockExpiresAt?: number;
  lastRequestedAt?: number;
};

type RecomputeDecisionInput = {
  now: number;
  route: RouteSnapshot | null;
  origin: Endpoint;
  destination: Endpoint;
};

type ReplaceDecisionInput = {
  now: number;
  current: RouteSnapshot | null;
  next: {
    trafficDurationSeconds: number;
    geometryHash: string;
    origin: Endpoint;
    destination: Endpoint;
  };
};

type MeetingPlaceDoc = Doc<"sessionMeetingPlaces">;

function getTomTomBaseUrl(): string {
  return process.env.TOMTOM_ROUTING_BASE_URL?.trim() || "https://api.tomtom.com";
}

function getTomTomApiKey(): string {
  return process.env.TOMTOM_ROUTING_API_KEY?.trim() || "";
}

function getRouteKey(route: Doc<"sessionRoutes">): string {
  return route.routeKey ?? PAIR_ROUTE_KEY;
}

function getMeetingPlaceStatus(place: MeetingPlaceDoc, now: number): "set" | "removal_requested" {
  if (place.status === "removal_requested" && (place.removalRequestExpiresAt ?? 0) > now) {
    return "removal_requested";
  }
  return "set";
}

function buildMeetingRouteKey(
  userId: Id<"users">,
  place: { lat: number; lng: number; providerPlaceId?: string }
): string {
  const providerKey = place.providerPlaceId?.trim();
  const fallbackKey = `${roundTo(place.lat, 5)},${roundTo(place.lng, 5)}`;
  return `meeting:${String(userId)}:${providerKey || fallbackKey}`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const earthRadius = 6371e3;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return earthRadius * c;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeEndpoint(endpoint: Endpoint): Endpoint {
  const decimals = (endpoint.accuracy ?? 0) > 40 ? 4 : 6;
  return {
    lat: roundTo(endpoint.lat, decimals),
    lng: roundTo(endpoint.lng, decimals),
    accuracy: endpoint.accuracy,
    timestamp: endpoint.timestamp,
  };
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function buildGeometryHash(points: RoutePoint[]): string {
  if (points.length === 0) return "empty";
  const sampleSize = 16;
  const step = Math.max(1, Math.floor(points.length / sampleSize));
  const sampled: string[] = [];
  for (let i = 0; i < points.length; i += step) {
    const point = points[i];
    sampled.push(`${point.lat.toFixed(5)},${point.lng.toFixed(5)}`);
  }
  const first = points[0];
  const last = points[points.length - 1];
  sampled.push(`f:${first.lat.toFixed(5)},${first.lng.toFixed(5)}`);
  sampled.push(`l:${last.lat.toFixed(5)},${last.lng.toFixed(5)}`);
  return `${points.length}|${sampled.join("|")}`;
}

function toRouteSnapshot(route: Doc<"sessionRoutes"> | null): RouteSnapshot | null {
  if (!route) return null;
  return {
    routeKey: getRouteKey(route),
    routeOwnerUserId: route.routeOwnerUserId ?? null,
    destinationMode: route.destinationMode ?? "partner",
    destinationPlaceId: route.destinationPlaceId,
    status: route.status,
    polyline: route.polyline,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    trafficDurationSeconds: route.trafficDurationSeconds,
    computedAt: route.computedAt,
    expiresAt: route.expiresAt,
    origin: route.origin,
    destination: route.destination,
    geometryHash: route.geometryHash,
    lastError: route.lastError,
    lockToken: route.lockToken,
    lockExpiresAt: route.lockExpiresAt,
    lastRequestedAt: route.lastRequestedAt,
  };
}

function serializeRouteForClient(route: Doc<"sessionRoutes"> | null, now: number) {
  const snapshot = toRouteSnapshot(route);
  if (!snapshot) return null;
  return {
    ...snapshot,
    provider: PROVIDER,
    isFresh: snapshot.status === "ready" && snapshot.expiresAt > now,
    ageMs: Math.max(now - snapshot.computedAt, 0),
    isLocked: typeof snapshot.lockExpiresAt === "number" && snapshot.lockExpiresAt > now,
  };
}

function buildRouteSnapshotMap(routes: Doc<"sessionRoutes">[]) {
  const map = new Map<string, RouteSnapshot>();
  for (const route of routes) {
    const snapshot = toRouteSnapshot(route);
    if (!snapshot) continue;
    const routeKey = snapshot.routeKey ?? PAIR_ROUTE_KEY;
    const existing = map.get(routeKey);
    if (!existing || existing.computedAt < snapshot.computedAt) {
      map.set(routeKey, snapshot);
    }
  }
  return map;
}

function pickRouteByKey(routes: Doc<"sessionRoutes">[], routeKey: string): Doc<"sessionRoutes"> | null {
  const candidates = routes.filter((route) => getRouteKey(route) === routeKey);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.computedAt - a.computedAt);
  return candidates[0];
}

export function shouldRecomputeRoute(input: RecomputeDecisionInput): boolean {
  const { now, route, origin, destination } = input;
  if (!route) return true;

  const isExpired = route.expiresAt <= now;
  if (isExpired) return true;

  const elapsed = now - route.computedAt;
  const cadenceElapsed = elapsed >= MIN_RECOMPUTE_INTERVAL_MS;
  const originMoved =
    haversineMeters(
      { lat: route.origin.lat, lng: route.origin.lng },
      { lat: origin.lat, lng: origin.lng }
    ) >= MOVEMENT_THRESHOLD_METERS;
  const destinationMoved =
    haversineMeters(
      { lat: route.destination.lat, lng: route.destination.lng },
      { lat: destination.lat, lng: destination.lng }
    ) >= MOVEMENT_THRESHOLD_METERS;

  return cadenceElapsed || originMoved || destinationMoved;
}

export function shouldReplaceRoute(input: ReplaceDecisionInput): boolean {
  const { now, current, next } = input;
  if (!current || current.status !== "ready") return true;

  const stale = now - current.computedAt >= FORCE_REPLACE_STALE_MS;
  if (stale) return true;

  const currentEta = current.trafficDurationSeconds ?? Number.POSITIVE_INFINITY;
  const etaDelta = next.trafficDurationSeconds - currentEta;
  const movedOrigin = haversineMeters(
    { lat: current.origin.lat, lng: current.origin.lng },
    { lat: next.origin.lat, lng: next.origin.lng }
  );
  const movedDestination = haversineMeters(
    { lat: current.destination.lat, lng: current.destination.lng },
    { lat: next.destination.lat, lng: next.destination.lng }
  );
  const endpointShift = Math.max(movedOrigin, movedDestination);

  if (next.geometryHash !== (current.geometryHash ?? "")) {
    if (endpointShift >= MOVEMENT_THRESHOLD_METERS) return true;
    return etaDelta <= -ETA_HYSTERESIS_SECONDS;
  }

  if (etaDelta <= -ETA_HYSTERESIS_SECONDS) return true;
  if (etaDelta >= ETA_HYSTERESIS_SECONDS * 2) return true;

  return false;
}

async function getLatestLocationForUser(
  ctx: QueryCtx,
  sessionId: Id<"locationSessions">,
  userId: Id<"users">
) {
  const latest = await ctx.db
    .query("locations")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("sessionId"), sessionId))
    .order("desc")
    .take(1);
  return latest[0] ?? null;
}

async function getSessionMeetingPlace(ctx: QueryCtx, sessionId: Id<"locationSessions">) {
  const rows = await ctx.db
    .query("sessionMeetingPlaces")
    .withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId))
    .take(1);
  return rows[0] ?? null;
}

async function getSessionRoutes(ctx: QueryCtx, sessionId: Id<"locationSessions">) {
  return await ctx.db
    .query("sessionRoutes")
    .withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId))
    .collect();
}

async function getRouteSnapshotByKey(
  ctx: QueryCtx,
  sessionId: Id<"locationSessions">,
  routeKey: string
) {
  const keyed = await ctx.db
    .query("sessionRoutes")
    .withIndex("by_session_routeKey", (q: any) =>
      q.eq("sessionId", sessionId).eq("routeKey", routeKey)
    )
    .collect();
  if (keyed.length > 0) {
    keyed.sort((a, b) => b.computedAt - a.computedAt);
    return keyed[0];
  }

  if (routeKey !== PAIR_ROUTE_KEY) return null;
  const routes = await getSessionRoutes(ctx, sessionId);
  return pickRouteByKey(routes, routeKey);
}

function parseTomTomRoutePayload(payload: unknown): {
  points: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  trafficDurationSeconds: number;
  geometryHash: string;
} {
  const root = (payload ?? {}) as Record<string, unknown>;
  const routes = Array.isArray(root.routes) ? root.routes : [];
  const firstRoute = routes[0] as Record<string, unknown> | undefined;
  if (!firstRoute) {
    throw new Error("TomTom routing returned no routes");
  }

  const summary = (firstRoute.summary ?? {}) as Record<string, unknown>;
  const distanceMeters = readNumber(summary.lengthInMeters);
  const trafficDurationSeconds = readNumber(summary.travelTimeInSeconds);
  const noTrafficDuration = readNumber(summary.noTrafficTravelTimeInSeconds);
  const trafficDelay = readNumber(summary.trafficDelayInSeconds);
  const durationSeconds =
    noTrafficDuration ??
    (typeof trafficDurationSeconds === "number" && typeof trafficDelay === "number"
      ? Math.max(trafficDurationSeconds - trafficDelay, 0)
      : trafficDurationSeconds);

  const legs = Array.isArray(firstRoute.legs) ? firstRoute.legs : [];
  const points: RoutePoint[] = [];
  for (const leg of legs) {
    const legRecord = leg as Record<string, unknown>;
    const legPoints = Array.isArray(legRecord.points) ? legRecord.points : [];
    for (const p of legPoints) {
      const point = p as Record<string, unknown>;
      const lat = readNumber(point.latitude);
      const lng = readNumber(point.longitude);
      if (typeof lat === "number" && typeof lng === "number") {
        points.push({ lat, lng });
      }
    }
  }

  if (points.length < 2) {
    throw new Error("TomTom route geometry is empty");
  }
  if (
    typeof distanceMeters !== "number" ||
    typeof durationSeconds !== "number" ||
    typeof trafficDurationSeconds !== "number"
  ) {
    throw new Error("TomTom route summary is incomplete");
  }

  return {
    points,
    distanceMeters,
    durationSeconds,
    trafficDurationSeconds,
    geometryHash: buildGeometryHash(points),
  };
}

async function fetchTomTomRoute(origin: Endpoint, destination: Endpoint) {
  const apiKey = getTomTomApiKey();
  if (!apiKey) {
    throw new Error("TOMTOM_ROUTING_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    key: apiKey,
    traffic: "true",
    travelMode: "car",
    routeType: "fastest",
    routeRepresentation: "polyline",
    computeTravelTimeFor: "all",
  });

  const baseUrl = getTomTomBaseUrl().replace(/\/+$/, "");
  const path = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
  const endpoint = `${baseUrl}/routing/1/calculateRoute/${path}/json?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`TomTom routing failed (${response.status}): ${text}`);
    }

    const payload = await response.json();
    return parseTomTomRoutePayload(payload);
  } finally {
    clearTimeout(timeoutId);
  }
}

export const getRecomputeContext = internalQuery({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return {
        exists: false,
        isParticipant: false,
        isActive: false,
        sessionUser1Id: null,
        sessionUser2Id: null,
        myLocation: null,
        partnerLocation: null,
        user1Location: null,
        user2Location: null,
        meetingPlace: null,
        routes: [],
      };
    }

    const isHost = session.user1Id === args.userId;
    const isGuest = session.user2Id === args.userId;
    const partnerId = isHost ? session.user2Id ?? null : isGuest ? session.user1Id : null;
    const [meetingPlace, routes] = await Promise.all([
      getSessionMeetingPlace(ctx, args.sessionId),
      getSessionRoutes(ctx, args.sessionId),
    ]);

    if (!isHost && !isGuest) {
      return {
        exists: true,
        isParticipant: false,
        isActive: false,
        sessionUser1Id: session.user1Id,
        sessionUser2Id: session.user2Id ?? null,
        myLocation: null,
        partnerLocation: null,
        user1Location: null,
        user2Location: null,
        meetingPlace,
        routes,
      };
    }

    const [myLocation, partnerLocation, user1Location, user2Location] = await Promise.all([
      getLatestLocationForUser(ctx, args.sessionId, args.userId),
      partnerId === null ? Promise.resolve(null) : getLatestLocationForUser(ctx, args.sessionId, partnerId),
      getLatestLocationForUser(ctx, args.sessionId, session.user1Id),
      session.user2Id ? getLatestLocationForUser(ctx, args.sessionId, session.user2Id) : Promise.resolve(null),
    ]);

    return {
      exists: true,
      isParticipant: true,
      isActive: session.status === "active" && session.user2Id !== undefined,
      sessionUser1Id: session.user1Id,
      sessionUser2Id: session.user2Id ?? null,
      myLocation,
      partnerLocation,
      user1Location,
      user2Location,
      meetingPlace,
      routes,
    };
  },
});

export const getForSession = query({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (session.user1Id !== args.userId && session.user2Id !== args.userId) {
      throw new Error("Not authorized");
    }

    const meetingPlace = await getSessionMeetingPlace(ctx, args.sessionId);
    const routeKey = meetingPlace
      ? buildMeetingRouteKey(args.userId, meetingPlace.place)
      : PAIR_ROUTE_KEY;
    const route = await getRouteSnapshotByKey(ctx, args.sessionId, routeKey);
    const now = Date.now();
    return serializeRouteForClient(route, now);
  },
});

export const getForSessionRoutes = query({
  args: { sessionId: v.id("locationSessions"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (session.user1Id !== args.userId && session.user2Id !== args.userId) {
      throw new Error("Not authorized");
    }

    const now = Date.now();
    const [meetingPlace, routes] = await Promise.all([
      getSessionMeetingPlace(ctx, args.sessionId),
      getSessionRoutes(ctx, args.sessionId),
    ]);

    if (meetingPlace) {
      const participantIds: Id<"users">[] = [session.user1Id];
      if (session.user2Id) participantIds.push(session.user2Id);

      const selected = participantIds
        .map((participantId) => buildMeetingRouteKey(participantId, meetingPlace.place))
        .map((routeKey) => pickRouteByKey(routes, routeKey))
        .filter((route): route is Doc<"sessionRoutes"> => route !== null);

      const meetingStatus = getMeetingPlaceStatus(meetingPlace, now);
      return {
        mode: "meeting_place" as const,
        meetingPlace: {
          status: meetingStatus,
          place: meetingPlace.place,
          setByUserId: meetingPlace.setByUserId,
          removalRequestedBy:
            meetingStatus === "removal_requested"
              ? meetingPlace.removalRequestedBy ?? null
              : null,
          removalRequestExpiresAt:
            meetingStatus === "removal_requested"
              ? meetingPlace.removalRequestExpiresAt ?? null
              : null,
          updatedAt: meetingPlace.updatedAt,
        },
        routes: selected
          .map((route) => serializeRouteForClient(route, now))
          .filter((route): route is NonNullable<ReturnType<typeof serializeRouteForClient>> => Boolean(route)),
      };
    }

    const pairRoute = pickRouteByKey(routes, PAIR_ROUTE_KEY);
    const serializedPair = serializeRouteForClient(pairRoute, now);
    return {
      mode: "pair" as const,
      meetingPlace: null,
      routes: serializedPair ? [serializedPair] : [],
    };
  },
});

export const acquireRecomputeLock = internalMutation({
  args: {
    sessionId: v.id("locationSessions"),
    routeKey: v.string(),
    routeOwnerUserId: v.optional(v.id("users")),
    destinationMode: v.union(v.literal("partner"), v.literal("meeting_place")),
    destinationPlaceId: v.optional(v.string()),
    lockToken: v.string(),
    now: v.number(),
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
  },
  handler: async (ctx, args) => {
    const existing = await getRouteSnapshotByKey(ctx, args.sessionId, args.routeKey);
    if (!existing) {
      await ctx.db.insert("sessionRoutes", {
        sessionId: args.sessionId,
        routeKey: args.routeKey,
        routeOwnerUserId: args.routeOwnerUserId,
        destinationMode: args.destinationMode,
        destinationPlaceId: args.destinationPlaceId,
        provider: PROVIDER,
        status: "pending",
        computedAt: args.now,
        expiresAt: args.now + ERROR_RETRY_AFTER_MS,
        origin: args.origin,
        destination: args.destination,
        lockToken: args.lockToken,
        lockExpiresAt: args.now + LOCK_TTL_MS,
        lastRequestedAt: args.now,
      });
      return { acquired: true as const, reason: "created_pending" as const };
    }

    if ((existing.lockExpiresAt ?? 0) > args.now) {
      return { acquired: false as const, reason: "in_flight" as const };
    }

    await ctx.db.patch(existing._id, {
      routeKey: args.routeKey,
      routeOwnerUserId: args.routeOwnerUserId,
      destinationMode: args.destinationMode,
      destinationPlaceId: args.destinationPlaceId,
      status: existing.status === "ready" ? "ready" : "pending",
      lockToken: args.lockToken,
      lockExpiresAt: args.now + LOCK_TTL_MS,
      lastRequestedAt: args.now,
      origin: args.origin,
      destination: args.destination,
    });

    return { acquired: true as const, reason: "lock_acquired" as const };
  },
});

export const upsertRouteSnapshot = internalMutation({
  args: {
    sessionId: v.id("locationSessions"),
    routeKey: v.string(),
    routeOwnerUserId: v.optional(v.id("users")),
    destinationMode: v.union(v.literal("partner"), v.literal("meeting_place")),
    destinationPlaceId: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    const existing = await getRouteSnapshotByKey(ctx, args.sessionId, args.routeKey);
    if (!existing) {
      return await ctx.db.insert("sessionRoutes", {
        sessionId: args.sessionId,
        routeKey: args.routeKey,
        routeOwnerUserId: args.routeOwnerUserId,
        destinationMode: args.destinationMode,
        destinationPlaceId: args.destinationPlaceId,
        provider: PROVIDER,
        status: args.status,
        polyline: args.polyline,
        distanceMeters: args.distanceMeters,
        durationSeconds: args.durationSeconds,
        trafficDurationSeconds: args.trafficDurationSeconds,
        computedAt: args.computedAt,
        expiresAt: args.expiresAt,
        origin: args.origin,
        destination: args.destination,
        geometryHash: args.geometryHash,
        lastError: args.lastError,
        errorAt: args.errorAt,
        lockToken: args.lockToken,
        lockExpiresAt: args.lockExpiresAt,
        lastRequestedAt: args.lastRequestedAt,
      });
    }

    await ctx.db.patch(existing._id, {
      routeKey: args.routeKey,
      routeOwnerUserId: args.routeOwnerUserId,
      destinationMode: args.destinationMode,
      destinationPlaceId: args.destinationPlaceId,
      status: args.status,
      polyline: args.polyline,
      distanceMeters: args.distanceMeters,
      durationSeconds: args.durationSeconds,
      trafficDurationSeconds: args.trafficDurationSeconds,
      computedAt: args.computedAt,
      expiresAt: args.expiresAt,
      origin: args.origin,
      destination: args.destination,
      geometryHash: args.geometryHash,
      lastError: args.lastError,
      errorAt: args.errorAt,
      lockToken: args.lockToken,
      lockExpiresAt: args.lockExpiresAt,
      lastRequestedAt: args.lastRequestedAt,
      provider: PROVIDER,
    });
    return existing._id;
  },
});

export const releaseRecomputeLock = internalMutation({
  args: {
    sessionId: v.id("locationSessions"),
    routeKey: v.string(),
    lockToken: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await getRouteSnapshotByKey(ctx, args.sessionId, args.routeKey);
    if (!existing) return { released: false as const, reason: "missing" as const };
    if (existing.lockToken !== args.lockToken) {
      return { released: false as const, reason: "lock_mismatch" as const };
    }

    await ctx.db.patch(existing._id, {
      lockToken: undefined,
      lockExpiresAt: undefined,
    });
    return { released: true as const, reason: "released" as const };
  },
});

export const cleanupExpiredRouteSnapshots = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("sessionRoutes")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .collect();

    let deleted = 0;
    for (const route of expired) {
      if ((route.lockExpiresAt ?? 0) > now) continue;
      await ctx.db.delete(route._id);
      deleted++;
    }
    return { deleted };
  },
});

type RecomputeTask = {
  routeKey: string;
  routeOwnerUserId: Id<"users"> | null;
  destinationMode: DestinationMode;
  destinationPlaceId?: string;
  origin: Endpoint;
  destination: Endpoint;
  current: RouteSnapshot | null;
};

export const recomputeFastestRoad = action({
  args: {
    sessionId: v.id("locationSessions"),
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const internalApi = internal as any;
    const now = Date.now();

    const context = await ctx.runQuery(internalApi.routes.getRecomputeContext, {
      sessionId: args.sessionId,
      userId: args.userId,
    });

    if (!context.exists) {
      return { status: "skipped" as const, reason: "missing_session" as const };
    }
    if (!context.isParticipant) {
      return { status: "skipped" as const, reason: "unauthorized" as const };
    }
    if (!context.isActive) {
      return { status: "skipped" as const, reason: "session_not_active" as const };
    }

    const existingRoutes = buildRouteSnapshotMap((context.routes ?? []) as Doc<"sessionRoutes">[]);
    const tasks: RecomputeTask[] = [];
    const meetingPlace = (context.meetingPlace ?? null) as MeetingPlaceDoc | null;

    if (meetingPlace) {
      const destinationPlaceId =
        meetingPlace.place.providerPlaceId ??
        `${roundTo(meetingPlace.place.lat, 5)},${roundTo(meetingPlace.place.lng, 5)}`;
      const destination = normalizeEndpoint({
        lat: meetingPlace.place.lat,
        lng: meetingPlace.place.lng,
        timestamp: now,
      });

      const participants: Array<{ userId: Id<"users">; location: any | null }> = [
        { userId: context.sessionUser1Id, location: context.user1Location },
      ];
      if (context.sessionUser2Id) {
        participants.push({ userId: context.sessionUser2Id, location: context.user2Location });
      }

      for (const participant of participants) {
        const location = participant.location;
        if (!location) continue;
        if (now - location.timestamp > LOCATION_FRESHNESS_MS) continue;

        const origin = normalizeEndpoint({
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
        });
        const routeKey = buildMeetingRouteKey(participant.userId, meetingPlace.place);
        tasks.push({
          routeKey,
          routeOwnerUserId: participant.userId,
          destinationMode: "meeting_place",
          destinationPlaceId,
          origin,
          destination,
          current: existingRoutes.get(routeKey) ?? null,
        });
      }

      if (tasks.length === 0) {
        return { status: "skipped" as const, reason: "stale_locations" as const };
      }
    } else {
      if (!context.myLocation || !context.partnerLocation) {
        return { status: "skipped" as const, reason: "missing_endpoints" as const };
      }
      if (
        now - context.myLocation.timestamp > LOCATION_FRESHNESS_MS ||
        now - context.partnerLocation.timestamp > LOCATION_FRESHNESS_MS
      ) {
        return { status: "skipped" as const, reason: "stale_locations" as const };
      }

      const routeKey = PAIR_ROUTE_KEY;
      const origin = normalizeEndpoint({
        lat: context.myLocation.lat,
        lng: context.myLocation.lng,
        accuracy: context.myLocation.accuracy,
        timestamp: context.myLocation.timestamp,
      });
      const destination = normalizeEndpoint({
        lat: context.partnerLocation.lat,
        lng: context.partnerLocation.lng,
        accuracy: context.partnerLocation.accuracy,
        timestamp: context.partnerLocation.timestamp,
      });
      tasks.push({
        routeKey,
        routeOwnerUserId: args.userId,
        destinationMode: "partner",
        destinationPlaceId: undefined,
        origin,
        destination,
        current: existingRoutes.get(routeKey) ?? null,
      });
    }

    const results: Array<{
      routeKey: string;
      status: "updated" | "skipped" | "fallback";
      reason?: string;
      etaSeconds?: number | null;
    }> = [];
    let updatedCount = 0;
    let fallbackCount = 0;

    for (const task of tasks) {
      const shouldRecompute = shouldRecomputeRoute({
        now,
        route: task.current,
        origin: task.origin,
        destination: task.destination,
      });
      if (!shouldRecompute) {
        results.push({
          routeKey: task.routeKey,
          status: "skipped",
          reason: "gated",
        });
        continue;
      }

      const lockToken = `${now}-${task.routeKey}-${Math.random().toString(36).slice(2, 10)}`;
      const lockResult = await ctx.runMutation(internalApi.routes.acquireRecomputeLock, {
        sessionId: args.sessionId,
        routeKey: task.routeKey,
        routeOwnerUserId: task.routeOwnerUserId ?? undefined,
        destinationMode: task.destinationMode,
        destinationPlaceId: task.destinationPlaceId,
        lockToken,
        now,
        origin: task.origin,
        destination: task.destination,
      });
      if (!lockResult.acquired) {
        results.push({
          routeKey: task.routeKey,
          status: "skipped",
          reason: "in_flight",
        });
        continue;
      }

      try {
        const computed = await fetchTomTomRoute(task.origin, task.destination);
        const shouldReplace = shouldReplaceRoute({
          now,
          current: task.current,
          next: {
            trafficDurationSeconds: computed.trafficDurationSeconds,
            geometryHash: computed.geometryHash,
            origin: task.origin,
            destination: task.destination,
          },
        });

        if (!shouldReplace && task.current) {
          await ctx.runMutation(internalApi.routes.releaseRecomputeLock, {
            sessionId: args.sessionId,
            routeKey: task.routeKey,
            lockToken,
          });
          results.push({
            routeKey: task.routeKey,
            status: "skipped",
            reason: "hysteresis_hold",
            etaSeconds: task.current.trafficDurationSeconds ?? null,
          });
          continue;
        }

        await ctx.runMutation(internalApi.routes.upsertRouteSnapshot, {
          sessionId: args.sessionId,
          routeKey: task.routeKey,
          routeOwnerUserId: task.routeOwnerUserId ?? undefined,
          destinationMode: task.destinationMode,
          destinationPlaceId: task.destinationPlaceId,
          status: "ready",
          polyline: computed.points,
          distanceMeters: computed.distanceMeters,
          durationSeconds: computed.durationSeconds,
          trafficDurationSeconds: computed.trafficDurationSeconds,
          computedAt: now,
          expiresAt: now + ROUTE_TTL_MS,
          origin: task.origin,
          destination: task.destination,
          geometryHash: computed.geometryHash,
          lastError: undefined,
          errorAt: undefined,
          lockToken: undefined,
          lockExpiresAt: undefined,
          lastRequestedAt: now,
        });

        updatedCount++;
        results.push({
          routeKey: task.routeKey,
          status: "updated",
          etaSeconds: computed.trafficDurationSeconds,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Route recompute failed";
        const currentRoute = task.current;
        const hasFallback =
          Boolean(currentRoute?.polyline?.length) &&
          Boolean(currentRoute && now - currentRoute.computedAt <= FALLBACK_GRACE_MS);

        if (hasFallback && currentRoute) {
          await ctx.runMutation(internalApi.routes.upsertRouteSnapshot, {
            sessionId: args.sessionId,
            routeKey: task.routeKey,
            routeOwnerUserId: task.routeOwnerUserId ?? undefined,
            destinationMode: task.destinationMode,
            destinationPlaceId: task.destinationPlaceId,
            status: "stale",
            polyline: currentRoute.polyline,
            distanceMeters: currentRoute.distanceMeters,
            durationSeconds: currentRoute.durationSeconds,
            trafficDurationSeconds: currentRoute.trafficDurationSeconds,
            computedAt: currentRoute.computedAt,
            expiresAt: now + ERROR_RETRY_AFTER_MS,
            origin: task.origin,
            destination: task.destination,
            geometryHash: currentRoute.geometryHash,
            lastError: message,
            errorAt: now,
            lockToken: undefined,
            lockExpiresAt: undefined,
            lastRequestedAt: now,
          });
        } else {
          await ctx.runMutation(internalApi.routes.upsertRouteSnapshot, {
            sessionId: args.sessionId,
            routeKey: task.routeKey,
            routeOwnerUserId: task.routeOwnerUserId ?? undefined,
            destinationMode: task.destinationMode,
            destinationPlaceId: task.destinationPlaceId,
            status: "error",
            polyline: undefined,
            distanceMeters: undefined,
            durationSeconds: undefined,
            trafficDurationSeconds: undefined,
            computedAt: now,
            expiresAt: now + ERROR_RETRY_AFTER_MS,
            origin: task.origin,
            destination: task.destination,
            geometryHash: undefined,
            lastError: message,
            errorAt: now,
            lockToken: undefined,
            lockExpiresAt: undefined,
            lastRequestedAt: now,
          });
        }

        await ctx.runMutation(internalApi.routes.releaseRecomputeLock, {
          sessionId: args.sessionId,
          routeKey: task.routeKey,
          lockToken,
        });

        fallbackCount++;
        console.warn("[routes] recompute_failed", {
          sessionId: args.sessionId,
          routeKey: task.routeKey,
          hasFallback,
          message,
        });
        results.push({
          routeKey: task.routeKey,
          status: "fallback",
          reason: hasFallback ? "using_last_good" : "no_fallback_available",
        });
      }
    }

    const status =
      updatedCount > 0 ? ("updated" as const) : fallbackCount > 0 ? ("fallback" as const) : ("skipped" as const);
    return {
      status,
      updatedCount,
      fallbackCount,
      results,
    };
  },
});
