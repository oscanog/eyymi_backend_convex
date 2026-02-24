import { query } from "./_generated/server";

/**
 * Health check query
 * Returns deployment status and timestamp
 */
export const check = query({
  args: {},
  handler: async (ctx) => {
    return {
      status: "ok",
      timestamp: Date.now(),
      version: "1.0.0",
      service: "man2man-api",
    };
  },
});
