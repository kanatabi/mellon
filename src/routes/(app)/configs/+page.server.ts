import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

/** C1 — the estate matrix (owner: "every app, every env, at a glance"):
 *  head versions, pin locks, key/empty counts. The sweep happens once
 *  server-side through the relay; the page is pure arithmetic over truth. */
export const load: PageServerLoad = async ({ cookies }) => {
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	return { rows: await api.estateSummary() };
};
