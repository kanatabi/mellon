import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// IA move (2026-11-11): this route's content lives at /admin/users now. 308
// (permanent, method-preserving) with the query riding along — matrix
// deep-links and old bookmarks keep working; the word-goes-here mapping
// is the owner's DECIDE-2 call.
export const load: PageServerLoad = ({ url }) => {
	redirect(308, `/admin/users${url.search}`);
};
