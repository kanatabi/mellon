import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	return { tags: await api.listTags() };
};
