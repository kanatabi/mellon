import { mockApi } from './mock.ts';
import { createLumenApi } from './fetch-adapter.ts';
import type { AdminApi } from './types.ts';

/**
 * The API entry: mock twin when API_BASE is unset (dev/tests, zero backend),
 * the REAL lumen transport when it is set (Phase C cutover). `bearer` is the
 * session token (mellon's httpOnly cookie value) — callers inside request
 * context pass it; the mock ignores it entirely. Same interface, zero UI
 * churn — that was the whole point of designing the seam first.
 */
export function createApi(bearer = ''): AdminApi {
	const base = process.env.API_BASE;
	if (!base) return mockApi;
	return createLumenApi(base.replace(/\/+$/, ''), bearer);
}

export { AdminApiError } from './types.ts';
export type * from './types.ts';
