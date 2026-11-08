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
		counts: { posts: posts.length, photos: photos.length, tags: tags.length },
		recentPosts: posts.slice(0, 6)
	};
};
