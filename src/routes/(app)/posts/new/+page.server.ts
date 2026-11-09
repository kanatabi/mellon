import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

// New-post lands STRAIGHT in the editor (owner call 2026-11-08): no separate
// creation form — the page seeds a starter doc; the first save/create POSTs
// it. The settings rail carries slug (auto from title) + meta.
export const load: PageServerLoad = async ({ cookies }) => {
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	const [tags, photos] = await Promise.all([api.listTags(), api.listPhotos()]);
	return { tags, photos: photos.items };
};
