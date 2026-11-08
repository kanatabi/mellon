import { error } from '@sveltejs/kit';
import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const api = createApi();
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
