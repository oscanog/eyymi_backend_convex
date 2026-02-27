import { describe, expect, it } from "vitest";
import {
  DUMMY_COUNT,
  DUMMY_DURATION_MS,
  buildDummyIdentity,
  isDummyDeploymentActive,
} from "../admin";

describe("admin dummy deployment logic helpers", () => {
  it("builds deterministic dummy identities by slot", () => {
    expect(buildDummyIdentity(1)).toEqual({
      deviceId: "admin_dummy_device_01",
      username: "dummy_user_01",
    });
    expect(buildDummyIdentity(10)).toEqual({
      deviceId: "admin_dummy_device_10",
      username: "dummy_user_10",
    });
  });

  it("keeps expected deployment constants", () => {
    expect(DUMMY_COUNT).toBe(10);
    expect(DUMMY_DURATION_MS).toBe(10 * 60 * 1000);
  });

  it("marks deployment active strictly before expiry", () => {
    const now = 1_700_000_000_000;
    expect(isDummyDeploymentActive(now + 1, now)).toBe(true);
    expect(isDummyDeploymentActive(now, now)).toBe(false);
    expect(isDummyDeploymentActive(now - 1, now)).toBe(false);
    expect(isDummyDeploymentActive(null, now)).toBe(false);
  });
});
