import { createLumenApi, DEV_DEFAULT_API_BASE } from './fetch-adapter.ts';
import type { AdminApi } from './types.ts';

/**
 * The API entry — REAL lumen only (owner ruling 2026-11-09, mock-first
 * superseded): unset API_BASE falls back to the dev default, the cluster
 * overrides via env. `bearer` is the session cookie value, threaded per
 * call-site; the mock era's runtime twin lives on ONLY as a test double
 * (api.test.ts imports mock.ts directly — nothing here does).
 */
export function createApi(bearer = ''): AdminApi {
	const base = process.env.API_BASE || DEV_DEFAULT_API_BASE;
	return createLumenApi(base.replace(/\/+$/, ''), bearer);
}

export { AdminApiError } from './types.ts';
export type * from './types.ts';
