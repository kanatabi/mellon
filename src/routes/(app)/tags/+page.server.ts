import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

/** 25 rows per page — display trim in browse mode, the engine's page size
 *  in search mode (both doors agree so the pager never lies). */
const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url, cookies }) => {
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	const q = (url.searchParams.get('q') ?? '').trim();
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const tags = await api.listTags();
	// search rides the ENGINE (ruling 2026-11-10): typo tolerance across the
	// whole vocabulary with honest totals; empty q is the browse door
	const search = q ? await api.searchTags(q, page, PAGE_SIZE) : null;
	return {
		tags,
		search,
		q,
		page,
		pageSize: PAGE_SIZE,
		tag: (url.searchParams.get('tag') ?? '').trim() // deep-linked dialog (palette/dashboard)
	};
};
