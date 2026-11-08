import { createApi } from '#lib/api/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get('status');
	const posts = await createApi().listPosts({
		status: status === 'draft' || status === 'published' ? status : undefined
	});
	return { posts, statusFilter: status === 'draft' || status === 'published' ? status : null };
};
