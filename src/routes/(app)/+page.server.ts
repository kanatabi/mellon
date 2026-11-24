import { SESSION_COOKIE, requireAuthed } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	// The dashboard is the USER'S HOME (the widget-home round): its server
	// load dials NO scoped API — each widget body fetches its own data
	// CLIENT-SIDE and only mounts when the principal holds its scope. A
	// scope-less user's home is the empty-state hint, never a 403 → 500
	// (the cliff the courtesy gates exist to prevent).
};
