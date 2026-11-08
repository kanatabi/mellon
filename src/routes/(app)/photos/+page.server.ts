import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Curation filters relay to the API (doctrine #1) — ?collection=(repeated)
// &gallery=&from=&to=&sort=&dir=, mapping 1:1 onto PhotoListOpts. Returned
// filter keys are prefixed "active*" so they never collide with the
// collections VOCABULARY the page also needs.
export const load: PageServerLoad = async ({ url }) => {
	const sp = url.searchParams;
	const gallery = sp.get('gallery');
	const sortRaw = sp.get('sort');
	const activeCollections = sp.getAll('collection');
	const from = sp.get('from');
	const to = sp.get('to');
	const sort =
		sortRaw === 'title' || sortRaw === 'collection' || sortRaw === 'created'
			? (sortRaw as 'title' | 'collection' | 'created')
			: undefined;
	const api = createApi();
	const [photos, collections] = await Promise.all([
		api.listPhotos({
			collections: activeCollections.length ? activeCollections : undefined,
			gallery: gallery === '1' ? true : gallery === '0' ? false : undefined,
			from: from && DATE_RE.test(from) ? from : undefined,
			to: to && DATE_RE.test(to) ? to : undefined,
			sort,
			dir: sp.get('dir') === 'asc' ? 'asc' : 'desc'
		}),
		api.listCollections()
	]);
	return {
		photos,
		collections,
		activeCollections,
		gallery: gallery === '1' ? true : gallery === '0' ? false : undefined,
		from: from && DATE_RE.test(from) ? from : undefined,
		to: to && DATE_RE.test(to) ? to : undefined,
		sort: sort ?? ('created' as const),
		dir: sp.get('dir') === 'asc' ? ('asc' as const) : ('desc' as const)
	};
};
