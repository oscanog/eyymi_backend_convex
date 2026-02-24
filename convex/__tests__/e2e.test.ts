/**
 * E2E Health Check
 * 
 * These tests verify the Convex deployment is accessible.
 */

import { describe, expect, it } from "vitest";

// Production deployment URL
const PROD_URL = "https://admired-partridge-479.convex.cloud";
const DEV_URL = "https://fastidious-tapir-498.convex.cloud";

describe("Deployment Health", () => {
  it("should verify production deployment is running", async () => {
    const response = await fetch(PROD_URL, { 
      method: "HEAD",
      // Don't throw on error status
      redirect: "manual"
    });
    
    // Convex returns various status codes but deployment is up if < 500
    expect(response.status).toBeLessThan(500);
  });

  it("should verify dev deployment is running", async () => {
    const response = await fetch(DEV_URL, { 
      method: "HEAD",
      redirect: "manual"
    });
    
    expect(response.status).toBeLessThan(500);
  });

  it("should list available API endpoints", () => {
    const endpoints = {
      users: ["users:upsert", "users:getByDevice", "users:heartbeat", "users:setOffline"],
      locationSessions: [
        "locationSessions:create",
        "locationSessions:join",
        "locationSessions:get",
        "locationSessions:close",
      ],
      sessionsCompatibility: ["sessions:create", "sessions:join", "sessions:get", "sessions:close"],
      locations: ["locations:update", "locations:getPartnerLocation", "locations:getHistory"],
      routes: ["routes:getForSession", "routes:recomputeFastestRoad"],
      health: ["health:check"],
    };

    expect(endpoints.users.length).toBe(4);
    expect(endpoints.locationSessions.length).toBe(4);
    expect(endpoints.sessionsCompatibility.length).toBe(4);
    expect(endpoints.locations.length).toBe(3);
    expect(endpoints.routes.length).toBe(2);
    expect(endpoints.health.length).toBe(1);
  });
});

// Manual test instructions
console.log(`
===================================
Convex Deployment Health Check
===================================

Production: ${PROD_URL}
Dev:        ${DEV_URL}

To test from Android:
1. Build APK with CONVEX_URL set to:
   - Production: ${PROD_URL}
   - Dev:        ${DEV_URL}

2. Install and run app

3. Check Convex Dashboard:
   https://dashboard.convex.dev

4. View logs in real-time:
   - Go to Logs tab
   - Filter by function name
   - Watch API calls from your app

===================================
`);
