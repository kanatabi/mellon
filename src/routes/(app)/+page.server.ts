import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	const [posts, photos, tags] = await Promise.all([
		api.listPosts(),
		api.listPhotos(),
		api.listTags()
	]);
	return {
		counts: { posts: posts.total, photos: photos.total, tags: tags.length },
		recentPosts: posts.items.slice(0, 6)
	};
};
