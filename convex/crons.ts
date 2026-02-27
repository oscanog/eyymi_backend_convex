import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled background jobs for cleanup
 */

const cron = cronJobs();
const internalApi = internal as any;

/**
 * Safety-net cleanup for stale waiting sessions every minute.
 * The mutation short-circuits quickly when no sessions exist.
 */
cron.interval(
  "cleanupStaleWaitingSessions",
  { minutes: 1 },
  internal.locationSessions.cleanupStaleWaitingSessions,
  {}
);

/**
 * Cleanup expired sessions every 5 minutes
 * Keeps long-expiry cleanup for fully expired sessions.
 */
cron.interval(
  "cleanupExpiredSessions",
  { minutes: 5 },
  internal.locationSessions.cleanupExpired,
  {}
);

/**
 * Cleanup old location data every 10 minutes
 * Keeps only last hour of location history per privacy policy
 */
cron.interval(
  "cleanupOldLocations",
  { minutes: 10 },
  internal.locations.cleanupOld,
  {}
);

/**
 * Cleanup expired route snapshots every minute.
 */
cron.interval(
  "cleanupExpiredRouteSnapshots",
  { minutes: 1 },
  internalApi.routes.cleanupExpiredRouteSnapshots,
  {}
);

/**
 * Resolve stale meeting-place removal requests every minute.
 */
cron.interval(
  "cleanupExpiredMeetingPlaceRemovalRequests",
  { minutes: 1 },
  internalApi.meetingPlaces.cleanupExpiredRemovalRequests,
  {}
);

/**
 * Mark stale users as offline every minute
 * Users not seen in 2 minutes get marked offline
 */
cron.interval(
  "markStaleUsersOffline",
  { minutes: 1 },
  internal.users.markStaleOffline,
  {}
);

/**
 * Keep admin dummy user deployment lifecycle in sync every minute.
 */
cron.interval(
  "syncAdminDummyUsersLifecycle",
  { minutes: 1 },
  internalApi.admin.syncDummyUsersLifecycle,
  {}
);

/**
 * Cleanup inactive users every minute
 * Removes users inactive for 5 minutes when not linked to active session/invite.
 */
cron.interval(
  "cleanupInactiveUsers",
  { minutes: 1 },
  internal.users.cleanupInactiveUsers,
  {}
);

export default cron;
