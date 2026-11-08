import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

// New-post lands STRAIGHT in the editor (owner call 2026-11-08): no separate
// creation form — the page seeds a starter doc; the first save/create POSTs
// it. The settings rail carries slug (auto from title) + meta.
export const load: PageServerLoad = async () => {
	const api = createApi();
	const [tags, photos] = await Promise.all([api.listTags(), api.listPhotos()]);
	return { tags, photos };
};
