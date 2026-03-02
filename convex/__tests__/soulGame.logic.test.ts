import { describe, expect, it } from "vitest";
import {
  SOUL_GAME_CONFIG,
  canCommitHoldWithinWindow,
  clampPressEnd,
  getSoulGameFocusTarget,
  getSoulGameFocusWindow,
  getHoldProgress,
} from "../soulGameLogic";

describe("soul game logic helpers", () => {
  it("keeps expected constants", () => {
    expect(SOUL_GAME_CONFIG.MIN_HOLD_MS).toBeGreaterThan(0);
    expect(SOUL_GAME_CONFIG.FOCUS_WINDOW_MS).toBe(3000);
    expect(SOUL_GAME_CONFIG.RING_PROGRESS_MS).toBe(SOUL_GAME_CONFIG.MIN_HOLD_MS);
  });

  it("derives the current 3 second focus window", () => {
    expect(getSoulGameFocusWindow(0)).toEqual({
      id: "0",
      startsAt: 0,
      endsAt: 3000,
      durationMs: 3000,
    });
    expect(getSoulGameFocusWindow(3100)).toEqual({
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

    expect(getSoulGameFocusTarget(entries, "self", 0)?._id).toBe("alpha");
    expect(getSoulGameFocusTarget(entries, "self", 3000)?._id).toBe("bravo");
    expect(getSoulGameFocusTarget([{ _id: "self", joinedAt: 1000 }], "self", 0)).toBeNull();
  });

  it("clamps press end duration", () => {
    const startedAt = 1_000;
    const clamped = clampPressEnd(startedAt, startedAt + SOUL_GAME_CONFIG.MAX_PRESS_DURATION_MS * 10);
    expect(clamped).toBe(startedAt + SOUL_GAME_CONFIG.MAX_PRESS_DURATION_MS);
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

