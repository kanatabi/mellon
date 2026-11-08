import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const api = createApi();
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
