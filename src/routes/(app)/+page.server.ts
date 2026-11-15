import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, requireAuthed } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	const bearer = requireAuthed(cookies.get(SESSION_COOKIE), url);
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	// One round trip feeds all three dashboard cards. Sort defaults already
	// mean "latest" (posts: updated desc · photos: created desc ·
	// listNewestTags: created_at desc) — the page slices, never re-sorts.
	const [posts, photos, tags, newest] = await Promise.all([
		api.listPosts(),
		api.listPhotos(),
		api.listTags(),
		api.listNewestTags()
	]);
	return {
		counts: { posts: posts.total, photos: photos.total, tags: tags.length },
		latestPosts: posts.items.slice(0, 5),
		latestPhotos: photos.items.slice(0, 8),
		newestTags: newest.slice(0, 8)
	};
};
