import { describe, expect, it } from "vitest";
import { clampPressEnd, getOverlapMs, shouldMatchPressIntervals } from "../soulGameLogic";

describe("soul game overlap logic", () => {
  it("clamps press end to max duration", () => {
    const start = 1_000;
    expect(clampPressEnd(start, start + 10_000, 6_000)).toBe(start + 6_000);
  });

  it("computes overlap in milliseconds", () => {
    expect(
      getOverlapMs(
        { start: 1_000, end: 2_000 },
        { start: 1_500, end: 2_400 },
      ),
    ).toBe(500);
  });

  it("matches when both holds are valid and overlap threshold is met", () => {
    const result = shouldMatchPressIntervals(
      { start: 1_000, end: 1_800 },
      { start: 1_300, end: 2_100 },
      {
        MIN_HOLD_MS: 600,
        MIN_OVERLAP_MS: 350,
        MAX_PRESS_DURATION_MS: 6000,
        QUEUE_STALE_AFTER_MS: 45_000,
        SESSION_DURATION_MS: 120_000,
        INTRO_DURATION_MS: 1_000,
      },
    );
    expect(result.matched).toBe(true);
    expect(result.overlap?.overlapMs).toBe(500);
  });

  it("rejects short holds even when overlap exists", () => {
    const result = shouldMatchPressIntervals(
      { start: 1_000, end: 1_400 },
      { start: 1_050, end: 1_800 },
    );
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("min_hold");
  });

  it("rejects when overlap is below threshold", () => {
    const result = shouldMatchPressIntervals(
      { start: 1_000, end: 1_800 },
      { start: 1_500, end: 2_100 },
      {
        MIN_HOLD_MS: 600,
        MIN_OVERLAP_MS: 400,
        MAX_PRESS_DURATION_MS: 6000,
        QUEUE_STALE_AFTER_MS: 45_000,
        SESSION_DURATION_MS: 120_000,
        INTRO_DURATION_MS: 1_000,
      },
    );
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("overlap");
  });
});
