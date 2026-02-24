import { describe, expect, it } from "vitest";
import { shouldRecomputeRoute, shouldReplaceRoute } from "../routes";

const now = Date.now();

const baseEndpoint = {
  lat: 14.5995,
  lng: 120.9842,
  timestamp: now,
  accuracy: 8,
};

describe("routes logic", () => {
  it("recomputes when no route snapshot exists", () => {
    expect(
      shouldRecomputeRoute({
        now,
        route: null,
        origin: baseEndpoint,
        destination: { ...baseEndpoint, lat: 14.6, lng: 120.99 },
      })
    ).toBe(true);
  });

  it("recomputes when route expires", () => {
    expect(
      shouldRecomputeRoute({
        now,
        route: {
          status: "ready",
          computedAt: now - 5_000,
          expiresAt: now - 10,
          origin: baseEndpoint,
          destination: { ...baseEndpoint, lat: 14.6, lng: 120.99 },
        },
        origin: baseEndpoint,
        destination: { ...baseEndpoint, lat: 14.6, lng: 120.99 },
      })
    ).toBe(true);
  });

  it("holds replacement for tiny ETA changes", () => {
    expect(
      shouldReplaceRoute({
        now,
        current: {
          status: "ready",
          computedAt: now - 3_000,
          expiresAt: now + 30_000,
          origin: baseEndpoint,
          destination: { ...baseEndpoint, lat: 14.6, lng: 120.99 },
          geometryHash: "abc",
          trafficDurationSeconds: 600,
        },
        next: {
          trafficDurationSeconds: 608,
          geometryHash: "abc",
          origin: baseEndpoint,
          destination: { ...baseEndpoint, lat: 14.6, lng: 120.99 },
        },
      })
    ).toBe(false);
  });

  it("replaces route for meaningful ETA improvement", () => {
    expect(
      shouldReplaceRoute({
        now,
        current: {
          status: "ready",
          computedAt: now - 3_000,
          expiresAt: now + 30_000,
          origin: baseEndpoint,
          destination: { ...baseEndpoint, lat: 14.6, lng: 120.99 },
          geometryHash: "abc",
          trafficDurationSeconds: 700,
        },
        next: {
          trafficDurationSeconds: 650,
          geometryHash: "abc",
          origin: baseEndpoint,
          destination: { ...baseEndpoint, lat: 14.6, lng: 120.99 },
        },
      })
    ).toBe(true);
  });
});
