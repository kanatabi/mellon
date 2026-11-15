import { error } from '@sveltejs/kit';
import { SESSION_COOKIE, requireAuthed } from '#lib/session.ts';
import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	const bearer = requireAuthed(cookies.get(SESSION_COOKIE), url);
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	let photo;
	try {
		photo = await api.getPhoto(params.id);
	} catch (e) {
		error(
			e instanceof Error && 'status' in e ? Number((e as { status?: number }).status ?? 500) : 500,
			'photo not found'
		);
	}
	// references load SERVER-side with the photo: the USED-IN list must be
	// true on first paint — delete warnings shown after hydration are advice
	// the reader may already have acted on without
	const [collections, references] = await Promise.all([
		api.listCollections(),
		api.listPhotoReferences(params.id)
	]);
	return { photo, collections, references };
};
