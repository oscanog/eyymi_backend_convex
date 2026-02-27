import { describe, expect, it } from "vitest";
import { COPY_MATCH_CONFIG, clampPressEnd, getIntervalOverlap } from "../copyMatchLogic";

describe("copy match logic helpers", () => {
  it("keeps expected constants", () => {
    expect(COPY_MATCH_CONFIG.MIN_HOLD_MS).toBeGreaterThan(0);
    expect(COPY_MATCH_CONFIG.MIN_OVERLAP_MS).toBeGreaterThan(0);
    expect(COPY_MATCH_CONFIG.RING_PROGRESS_MS).toBeGreaterThan(0);
  });

  it("computes overlap for intersecting intervals", () => {
    const overlap = getIntervalOverlap({ start: 1000, end: 2200 }, { start: 1600, end: 2600 });
    expect(overlap).toEqual({
      start: 1600,
      end: 2200,
      overlapMs: 600,
    });
  });

  it("returns null for non-overlapping intervals", () => {
    expect(getIntervalOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBeNull();
  });

  it("clamps press end duration", () => {
    const startedAt = 1_000;
    const clamped = clampPressEnd(startedAt, startedAt + COPY_MATCH_CONFIG.RING_PROGRESS_MS * 10);
    expect(clamped).toBe(startedAt + COPY_MATCH_CONFIG.RING_PROGRESS_MS * 3);
  });
});

