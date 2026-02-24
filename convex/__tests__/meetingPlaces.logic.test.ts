import { describe, expect, it } from "vitest";
import {
  normalizeMeetingSearchQuery,
  resolveMeetingPlaceStatus,
  validateMeetingSearchQuery,
} from "../meetingPlaces";

describe("meetingPlaces logic", () => {
  it("normalizes search input by trimming and collapsing spaces", () => {
    expect(normalizeMeetingSearchQuery("  grand   central   terminal ")).toBe("grand central terminal");
  });

  it("validates short and valid search queries", () => {
    expect(validateMeetingSearchQuery("a")).toEqual({
      normalized: "a",
      isSearchable: false,
      isTooLong: false,
    });

    expect(validateMeetingSearchQuery("coffee")).toEqual({
      normalized: "coffee",
      isSearchable: true,
      isTooLong: false,
    });
  });

  it("flags overlong search queries", () => {
    const raw = "x".repeat(130);
    expect(validateMeetingSearchQuery(raw)).toEqual({
      normalized: raw,
      isSearchable: true,
      isTooLong: true,
    });
  });

  it("treats removal requests as active only before expiry", () => {
    const now = Date.now();
    expect(resolveMeetingPlaceStatus("removal_requested", now + 10_000, now)).toBe("removal_requested");
    expect(resolveMeetingPlaceStatus("removal_requested", now - 1, now)).toBe("set");
    expect(resolveMeetingPlaceStatus("set", undefined, now)).toBe("set");
  });
});
