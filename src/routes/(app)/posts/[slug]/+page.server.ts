import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, requireAuthed } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, url, setHeaders }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	// STREAMED (owner ruling 2026-11-21): the three reads ride to the client
	// UNRESOLVED — SvelteKit streams the settlement, so the click renders
	// the editor's skeleton IMMEDIATELY. Awaiting here stuck the user on the
	// posts list behind the progress bar (three serial-parallel fetches gated
	// the whole route). A rejection streams into the page's {#catch} — the
	// not-found surface. The recent-cookie write moved to PostEditor (a
	// streamed shell cannot set cookies after the headers are sent).
	setHeaders({ 'cache-control': 'no-store' });
	return {
		slug: params.slug,
		detail: Promise.all([
			api.getPost(params.slug),
			api.listTags(),
			api.listPhotos().then((p) => p.items)
		])
	};
};
