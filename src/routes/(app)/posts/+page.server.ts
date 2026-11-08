import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

// Filtering/sorting is RELAYED to the API (doctrine #1: the UI never sorts or
// filters payloads itself) — these params map 1:1 onto PostListOpts.
export const load: PageServerLoad = async ({ url }) => {
	const sp = url.searchParams;
	const status = sp.get('status');
	const sort = sp.get('sort');
	const opts = {
		status:
			status === 'draft' || status === 'published' || status === 'unpublished'
				? (status as 'draft' | 'published' | 'unpublished')
				: undefined,
		tag: sp.getAll('tag'),
		sort: sort === 'oldest' || sort === 'title' ? (sort as 'oldest' | 'title') : ('newest' as const)
	};
	const api = createApi();
	const [posts, tags] = await Promise.all([api.listPosts(opts), api.listTags()]);
	return { posts, tags, ...opts, statusFilter: opts.status ?? null };
};
