import { describe, expect, it } from "vitest";
import {
  COPY_MATCH_CONFIG,
  canCommitHoldWithinWindow,
  clampPressEnd,
  getCopyFocusTarget,
  getCopyFocusWindow,
  getHoldProgress,
} from "../copyMatchLogic";

describe("copy match logic helpers", () => {
  it("keeps expected constants", () => {
    expect(COPY_MATCH_CONFIG.MIN_HOLD_MS).toBeGreaterThan(0);
    expect(COPY_MATCH_CONFIG.FOCUS_WINDOW_MS).toBe(3000);
    expect(COPY_MATCH_CONFIG.RING_PROGRESS_MS).toBe(COPY_MATCH_CONFIG.MIN_HOLD_MS);
  });

  it("derives the current 3 second focus window", () => {
    expect(getCopyFocusWindow(0)).toEqual({
      id: "0",
      startsAt: 0,
      endsAt: 3000,
      durationMs: 3000,
    });
    expect(getCopyFocusWindow(3100)).toEqual({
      id: "3000",
      startsAt: 3000,
      endsAt: 6000,
      durationMs: 3000,
    });
  });

  it("picks the centered target by server window", () => {
    const entries = [
      { _id: "self", joinedAt: 1000 },
      { _id: "alpha", joinedAt: 1100 },
      { _id: "bravo", joinedAt: 1200 },
    ];

    expect(getCopyFocusTarget(entries, "self", 0)?._id).toBe("alpha");
    expect(getCopyFocusTarget(entries, "self", 3000)?._id).toBe("bravo");
    expect(getCopyFocusTarget([{ _id: "self", joinedAt: 1000 }], "self", 0)).toBeNull();
  });

  it("clamps press end duration", () => {
    const startedAt = 1_000;
    const clamped = clampPressEnd(startedAt, startedAt + COPY_MATCH_CONFIG.MAX_PRESS_DURATION_MS * 10);
    expect(clamped).toBe(startedAt + COPY_MATCH_CONFIG.MAX_PRESS_DURATION_MS);
  });

  it("computes hold progress and window eligibility", () => {
    expect(getHoldProgress(1_750, 1_000)).toEqual({
      progressMs: 750,
      progressRatio: 0.5,
    });
    expect(canCommitHoldWithinWindow(1_000, 3_000)).toBe(true);
    expect(canCommitHoldWithinWindow(1_700, 3_000)).toBe(false);
  });
});

