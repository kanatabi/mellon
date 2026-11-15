import { redirect } from '@sveltejs/kit';
import { requireAuthed, SESSION_COOKIE } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

// IA move (2026-11-11): this route's content lives at /admin/users now. 308
// (permanent, method-preserving) with the query riding along — matrix
// deep-links and old bookmarks keep working; the word-goes-here mapping
// is the owner's DECIDE-2 call.
export const load: PageServerLoad = ({ url, cookies }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	redirect(308, `/admin/users${url.search}`);
};
