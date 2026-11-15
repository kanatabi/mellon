import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, requireAuthed } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

/** C1 — the estate matrix (owner: "every app, every env, at a glance"):
 *  head versions, pin locks, key/empty counts. The sweep happens once
 *  server-side through the relay; the page is pure arithmetic over truth. */
export const load: PageServerLoad = async ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	const bearer = requireAuthed(cookies.get(SESSION_COOKIE), url);
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	return { rows: await api.estateSummary() };
};
