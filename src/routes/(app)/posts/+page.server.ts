import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Filtering/sorting is RELAYED to the API (doctrine #1: the UI never sorts or
// filters payloads itself) — these params map 1:1 onto PostListOpts.
export const load: PageServerLoad = async ({ url }) => {
	const sp = url.searchParams;
	const status = sp.get('status');
	const sortRaw = sp.get('sort');
	const dirRaw = sp.get('dir');
	const from = sp.get('from');
	const to = sp.get('to');
	const opts = {
		status:
			status === 'draft' || status === 'published' || status === 'unpublished'
				? (status as 'draft' | 'published' | 'unpublished')
				: undefined,
		tag: sp.getAll('tag'),
		from: from && DATE_RE.test(from) ? from : undefined,
		to: to && DATE_RE.test(to) ? to : undefined,
		sort:
			sortRaw === 'created' || sortRaw === 'published' || sortRaw === 'title'
				? (sortRaw as 'created' | 'published' | 'title')
				: ('updated' as const),
		dir: dirRaw === 'asc' ? ('asc' as const) : ('desc' as const)
	};
	const api = createApi();
	const [posts, tags] = await Promise.all([api.listPosts(opts), api.listTags()]);
	return { posts, tags, ...opts, statusFilter: opts.status ?? null };
};
