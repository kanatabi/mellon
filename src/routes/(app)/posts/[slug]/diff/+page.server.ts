import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, requireAuthed } from '#lib/session.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, url, setHeaders }) => {
	// the cheap gate first: a dead session never dials lumen (same shape as
	// the editor's own load — the layout's redirect cannot stop these)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	let post;
	try {
		post = await api.getPost(params.slug);
	} catch (e) {
		error(
			e instanceof Error && 'status' in e ? Number((e as { status?: number }).status ?? 500) : 500,
			'post not found'
		);
	}
	// head is fetched fresh on EVERY visit: this page's left side must be the
	// server's truth, never the editor's possibly-stale seed (the conflict
	// story — decision 3 — depends on it).
	setHeaders({ 'cache-control': 'no-store' });
	return { post };
};
