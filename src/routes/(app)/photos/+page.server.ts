import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

// Curation filters relay to the API (doctrine #1) — ?collection=&gallery=&sort=&dir=.
export const load: PageServerLoad = async ({ url }) => {
	const sp = url.searchParams;
	const collection = sp.get('collection');
	const gallery = sp.get('gallery');
	const sort = sp.get('sort');
	const opts = {
		collection: collection ?? undefined,
		gallery: gallery === '1' ? true : gallery === '0' ? false : undefined,
		sort:
			sort === 'title' || sort === 'collection' || sort === 'created'
				? (sort as 'title' | 'collection' | 'created')
				: undefined,
		dir: sp.get('dir') === 'asc' ? ('asc' as const) : ('desc' as const)
	};
	const api = createApi();
	const [photos, collections] = await Promise.all([api.listPhotos(opts), api.listCollections()]);
	return { photos, collections, ...opts, sort: opts.sort ?? ('created' as const) };
};
