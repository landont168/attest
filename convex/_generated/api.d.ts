/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apify from "../apify.js";
import type * as auth from "../auth.js";
import type * as cases from "../cases.js";
import type * as corrections from "../corrections.js";
import type * as creao from "../creao.js";
import type * as datasets from "../datasets.js";
import type * as http from "../http.js";
import type * as investigations from "../investigations.js";
import type * as learningRecords from "../learningRecords.js";
import type * as lib from "../lib.js";
import type * as moss from "../moss.js";
import type * as policies from "../policies.js";
import type * as retrievalRecords from "../retrievalRecords.js";
import type * as retrievalValidators from "../retrievalValidators.js";
import type * as scheduleValidators from "../scheduleValidators.js";
import type * as scheduleWorkflow from "../scheduleWorkflow.js";
import type * as schedules from "../schedules.js";
import type * as team from "../team.js";
import type * as validators from "../validators.js";
import type * as workflows from "../workflows.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apify: typeof apify;
  auth: typeof auth;
  cases: typeof cases;
  corrections: typeof corrections;
  creao: typeof creao;
  datasets: typeof datasets;
  http: typeof http;
  investigations: typeof investigations;
  learningRecords: typeof learningRecords;
  lib: typeof lib;
  moss: typeof moss;
  policies: typeof policies;
  retrievalRecords: typeof retrievalRecords;
  retrievalValidators: typeof retrievalValidators;
  scheduleValidators: typeof scheduleValidators;
  scheduleWorkflow: typeof scheduleWorkflow;
  schedules: typeof schedules;
  team: typeof team;
  validators: typeof validators;
  workflows: typeof workflows;
  workspace: typeof workspace;
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

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
