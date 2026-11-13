import { createLumenApi, DEV_DEFAULT_API_BASE, type Upstreams } from './fetch-adapter.ts';
import type { AdminApi } from './types.ts';

/**
 * The API entry — REAL lumen only (owner ruling 2026-11-09, mock-first
 * superseded): unset env falls back to the dev default, the cluster
 * overrides via env. `bearer` is the session cookie value, threaded per
 * call-site; the mock era's runtime twin lives on ONLY as a test double
 * (api.test.ts imports mock.ts directly — nothing here does).
 *
 * DUAL UPSTREAMS (lumen role split, 2026-11-13): the cluster wires TWO
 * envs per portal deployment — ADMIN_URL (always lumen-admin: it holds the
 * users) and CMS_URL (this env's content lumen; the staging console gets
 * the staging service). Every call is then CLASSIFIED BY PATH, not here —
 * routing.ts owns that table; this file only resolves bases.
 *
 * The fallback chain keeps every older wiring honest, in priority order:
 *   ADMIN_URL/CMS_URL — the dual wiring (both set = the split is live).
 *   API_BASE         — the legacy single upstream: feeds BOTH classes.
 *   DEV_DEFAULT      — :8080 single binary (plain dev keeps working).
 * A lone ADMIN_URL or CMS_URL feeds the other class too: one named binary
 * is still a complete lumen; nothing here silently splits half an estate.
 */
export function resolveUpstreams(env: Record<string, string | undefined> = process.env): Upstreams {
	const legacy = env.API_BASE;
	const admin = env.ADMIN_URL || legacy || env.CMS_URL || DEV_DEFAULT_API_BASE;
	const cms = env.CMS_URL || legacy || env.ADMIN_URL || DEV_DEFAULT_API_BASE;
	return { admin, cms };
}

/** Was ANY upstream explicitly wired (any deploy posture), or are we on the
 *  dev default? The layout uses this to decide strict session-truth mode. */
export function isUpstreamConfigured(
	env: Record<string, string | undefined> = process.env
): boolean {
	return Boolean(env.ADMIN_URL || env.CMS_URL || env.API_BASE);
}

export function createApi(bearer = ''): AdminApi {
	return createLumenApi(resolveUpstreams(), bearer);
}

export { AdminApiError } from './types.ts';
export { RoutingError, ROUTE_TABLE, upstreamFor } from './routing.ts';
export type * from './types.ts';
