/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authOtp from "../authOtp.js";
import type * as authSessions from "../authSessions.js";
import type * as crons from "../crons.js";
import type * as health from "../health.js";
import type * as invites from "../invites.js";
import type * as locationSessions from "../locationSessions.js";
import type * as locations from "../locations.js";
import type * as meetingPlaces from "../meetingPlaces.js";
import type * as routes from "../routes.js";
import type * as sessions from "../sessions.js";
import type * as soulGameChat from "../soulGameChat.js";
import type * as soulGameLogic from "../soulGameLogic.js";
import type * as soulGameMatch from "../soulGameMatch.js";
import type * as soulGamePresence from "../soulGamePresence.js";
import type * as soulGameSessions from "../soulGameSessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authOtp: typeof authOtp;
  authSessions: typeof authSessions;
  crons: typeof crons;
  health: typeof health;
  invites: typeof invites;
  locationSessions: typeof locationSessions;
  locations: typeof locations;
  meetingPlaces: typeof meetingPlaces;
  routes: typeof routes;
  sessions: typeof sessions;
  soulGameChat: typeof soulGameChat;
  soulGameLogic: typeof soulGameLogic;
  soulGameMatch: typeof soulGameMatch;
  soulGamePresence: typeof soulGamePresence;
  soulGameSessions: typeof soulGameSessions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
