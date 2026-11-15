import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, requireAuthed } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

// New-post lands STRAIGHT in the editor (owner call 2026-11-08): no separate
// creation form — the page seeds a starter doc; the first save/create POSTs
// it. The settings rail carries slug (auto from title) + meta.
export const load: PageServerLoad = async ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	const bearer = requireAuthed(cookies.get(SESSION_COOKIE), url);
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	const [tags, photos] = await Promise.all([api.listTags(), api.listPhotos()]);
	return { tags, photos: photos.items };
};
