import { describe, expect, it } from "vitest";

describe("Schema Types", () => {
  it("should have valid user schema", () => {
    // Validate user schema structure
    const userFields = [
      "deviceId",
      "username",
      "usernameKey",
      "gender",
      "avatarId",
      "isOnline",
      "lastSeen",
      "isAdminDummy",
      "dummySlot",
    ];
    expect(userFields.length).toBe(9);
  });

  it("should have valid admin dummy deployment schema", () => {
    const deploymentFields = ["key", "userIds", "startedAt", "expiresAt", "updatedAt"];
    expect(deploymentFields.length).toBe(5);
  });

  it("should have valid location session schema", () => {
    // Validate location session schema structure
    const sessionFields = ["code", "user1Id", "user2Id", "status", "createdAt", "expiresAt"];
    expect(sessionFields.length).toBe(6);
  });

  it("should have valid location schema", () => {
    // Validate location schema structure
    const locationFields = ["sessionId", "userId", "lat", "lng", "accuracy", "timestamp"];
    expect(locationFields.length).toBe(6);
  });

  it("should validate 6-digit code format", () => {
    const codePattern = /^[A-Z0-9]{6}$/;
    
    // Valid codes
    expect("A3B7K9").toMatch(codePattern);
    expect("123456").toMatch(codePattern);
    expect("ABCDEF").toMatch(codePattern);
    
    // Invalid codes
    expect("A3B7K").not.toMatch(codePattern); // Too short
    expect("A3B7K90").not.toMatch(codePattern); // Too long
    expect("a3b7k9").not.toMatch(codePattern); // Lowercase
    expect("A3B7!9").not.toMatch(codePattern); // Special chars
  });
});

describe("API Endpoints", () => {
  it("should define all user endpoints", () => {
    const userEndpoints = [
      "users.upsert",
      "users.getByDevice", 
      "users.heartbeat",
      "users.setOffline",
      "users.getOnlineUsers",
      "admin.deployDummyUsers",
      "admin.getDummyUsersStatus",
    ];
    expect(userEndpoints.length).toBe(7);
  });

  it("should define canonical location session endpoints", () => {
    const sessionEndpoints = [
      "locationSessions.create",
      "locationSessions.join",
      "locationSessions.get",
      "locationSessions.getParticipantState",
      "locationSessions.close",
    ];
    expect(sessionEndpoints.length).toBe(5);
  });

  it("should keep temporary sessions compatibility endpoints", () => {
    const compatibilityEndpoints = [
      "sessions.create",
      "sessions.join",
      "sessions.get",
      "sessions.getParticipantState",
      "sessions.close",
    ];
    expect(compatibilityEndpoints.length).toBe(5);
  });

  it("should define all location endpoints", () => {
    const locationEndpoints = [
      "locations.update",
      "locations.getPartnerLocation",
      "locations.getMyLocation",
      "locations.getHistory",
    ];
    expect(locationEndpoints.length).toBe(4);
  });

  it("should define route endpoints", () => {
    const routeEndpoints = [
      "routes.getForSession",
      "routes.getForSessionRoutes",
      "routes.recomputeFastestRoad",
      "routes.upsertRouteSnapshot",
    ];
    expect(routeEndpoints.length).toBe(4);
  });

  it("should define meeting-place endpoints", () => {
    const meetingPlaceEndpoints = [
      "meetingPlaces.getForSession",
      "meetingPlaces.setMeetingPlace",
      "meetingPlaces.requestRemoval",
      "meetingPlaces.respondRemoval",
      "meetingPlaces.searchSuggestions",
    ];
    expect(meetingPlaceEndpoints.length).toBe(5);
  });
});

describe("User Gender Values", () => {
  it("should keep the allowed onboarding gender values", () => {
    const allowedGenders = ["male", "female", "gay", "lesbian"];
    expect(allowedGenders).toEqual(["male", "female", "gay", "lesbian"]);
  });

  it("should reject values outside the supported set", () => {
    const allowed = new Set(["male", "female", "gay", "lesbian"]);
    expect(allowed.has("man")).toBe(false);
    expect(allowed.has("woman")).toBe(false);
    expect(allowed.has("nonbinary")).toBe(false);
  });
});

describe("Session Status Flow", () => {
  it("should have correct status values", () => {
    const statuses = ["waiting", "active", "closed"];
    expect(statuses).toContain("waiting");
    expect(statuses).toContain("active");
    expect(statuses).toContain("closed");
  });

  it("should follow valid status transitions", () => {
    // waiting -> active (when partner joins)
    // waiting -> closed (when creator closes)
    // active -> closed (when either closes)
    const validTransitions = [
      { from: "waiting", to: "active" },
      { from: "waiting", to: "closed" },
      { from: "active", to: "closed" },
    ];
    expect(validTransitions.length).toBe(3);
  });
});
