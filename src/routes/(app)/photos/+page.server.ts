import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

// Curation filters relay to the API (doctrine #1) — ?collection=&gallery=.
export const load: PageServerLoad = async ({ url }) => {
	const sp = url.searchParams;
	const collection = sp.get('collection');
	const gallery = sp.get('gallery');
	const opts = {
		collection: collection ?? undefined,
		gallery: gallery === '1' ? true : gallery === '0' ? false : undefined
	};
	const api = createApi();
	const [photos, collections] = await Promise.all([api.listPhotos(opts), api.listCollections()]);
	return { photos, collections, ...opts };
};
