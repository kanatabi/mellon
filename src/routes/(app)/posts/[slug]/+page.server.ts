import { createApi } from '#lib/api/index.ts';
import { error } from '@sveltejs/kit';
import { RECENT_COOKIE, type RecentEntry } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, setHeaders }) => {
	const api = createApi();
	let post;
	try {
		post = await api.getPost(params.slug);
	} catch (e) {
		error(
			e instanceof Error && 'status' in e ? Number((e as { status?: number }).status ?? 500) : 500,
			'post not found'
		);
	}
	const [tags, photos] = await Promise.all([api.listTags(), api.listPhotos()]);

	// open-recent, cookie-backed (max 8, newest first) — feeds the palette.
	setHeaders({ 'cache-control': 'no-store' });
	let recent: RecentEntry[];
	try {
		recent = JSON.parse(cookies.get(RECENT_COOKIE) ?? '[]');
	} catch {
		recent = [];
	}
	recent = [
		{ slug: post.slug, title: post.title, at: Date.now() },
		...recent.filter((r) => r.slug !== post.slug)
	].slice(0, 8);
	cookies.set(RECENT_COOKIE, JSON.stringify(recent), {
		path: '/',
		httpOnly: false, // read by the palette's client commands — non-secret
		sameSite: 'strict',
		maxAge: 60 * 60 * 24 * 30
	});

	return { post, tags, photos: photos.items };
};
