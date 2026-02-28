import { describe, expect, it } from "vitest";
import {
  DUMMY_COUNT,
  DUMMY_DURATION_MS,
  buildDummyAvatarId,
  buildDummyGender,
  buildDummyIdentity,
  isDummyDeploymentActive,
  resolveCopyVisibilityEnabled,
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
    expect(buildDummyIdentity(40)).toEqual({
      deviceId: "admin_dummy_device_40",
      username: "dummy_user_40",
    });
  });

  it("keeps expected deployment constants", () => {
    expect(DUMMY_COUNT).toBe(40);
    expect(DUMMY_DURATION_MS).toBe(10 * 60 * 1000);
  });

  it("assigns deterministic dummy gender split per 10-slot bucket", () => {
    expect(buildDummyGender(1)).toBe("male");
    expect(buildDummyGender(10)).toBe("male");
    expect(buildDummyGender(11)).toBe("female");
    expect(buildDummyGender(20)).toBe("female");
    expect(buildDummyGender(21)).toBe("lesbian");
    expect(buildDummyGender(30)).toBe("lesbian");
    expect(buildDummyGender(31)).toBe("gay");
    expect(buildDummyGender(40)).toBe("gay");
  });

  it("cycles dummy avatar ids through copy-ava-01..10", () => {
    expect(buildDummyAvatarId(1)).toBe("copy-ava-01");
    expect(buildDummyAvatarId(10)).toBe("copy-ava-10");
    expect(buildDummyAvatarId(11)).toBe("copy-ava-01");
    expect(buildDummyAvatarId(40)).toBe("copy-ava-10");
  });

  it("marks deployment active strictly before expiry", () => {
    const now = 1_700_000_000_000;
    expect(isDummyDeploymentActive(now + 1, now)).toBe(true);
    expect(isDummyDeploymentActive(now, now)).toBe(false);
    expect(isDummyDeploymentActive(now - 1, now)).toBe(false);
    expect(isDummyDeploymentActive(null, now)).toBe(false);
  });

  it("defaults copy visibility to enabled for legacy deployment rows", () => {
    expect(resolveCopyVisibilityEnabled(undefined)).toBe(true);
    expect(resolveCopyVisibilityEnabled(null)).toBe(true);
    expect(resolveCopyVisibilityEnabled(true)).toBe(true);
    expect(resolveCopyVisibilityEnabled(false)).toBe(false);
  });
});
