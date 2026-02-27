import { describe, expect, it } from "vitest";
import {
  USER_GENDER_VALUES,
  buildUpsertPresencePayload,
  isSupportedUserGender,
} from "../users";

describe("users gender helpers", () => {
  it("accepts supported gender values", () => {
    for (const value of USER_GENDER_VALUES) {
      expect(isSupportedUserGender(value)).toBe(true);
    }
  });

  it("rejects unsupported gender values", () => {
    expect(isSupportedUserGender("nonbinary")).toBe(false);
    expect(isSupportedUserGender("man")).toBe(false);
    expect(isSupportedUserGender("")).toBe(false);
  });

  it("includes gender in upsert payload when provided", () => {
    const payload = buildUpsertPresencePayload({
      username: "alex",
      usernameKey: "alex",
      now: 123,
      gender: "gay",
    });

    expect(payload).toMatchObject({
      username: "alex",
      usernameKey: "alex",
      gender: "gay",
      isOnline: true,
      lastSeen: 123,
    });
  });

  it("does not include gender in upsert payload when omitted", () => {
    const payload = buildUpsertPresencePayload({
      username: "alex",
      usernameKey: "alex",
      now: 123,
    });

    expect(payload).toMatchObject({
      username: "alex",
      usernameKey: "alex",
      isOnline: true,
      lastSeen: 123,
    });
    expect("gender" in payload).toBe(false);
  });
});
