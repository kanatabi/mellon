import { mockApi } from './mock.ts';
import type { AdminApi } from './types.ts';

/**
 * The API entry. Phase A: always the mock. In Phase B, `API_BASE` set (server
 * env) swaps in a fetch adapter that speaks to lumen's §8/§9 — same interface,
 * zero UI churn. Until that exists, an attempted switch is loud, not silent.
 */
export function createApi(): AdminApi {
	const base = process.env.API_BASE; // server-only; deliberately unset in Phase A
	if (base) {
		throw new Error(
			'API_BASE is set, but the lumen fetch adapter lands in Phase B (M1/M3). ' +
				'Unset API_BASE to use the mock layer.'
		);
	}
	return mockApi;
}

export { AdminApiError } from './types.ts';
export type * from './types.ts';
