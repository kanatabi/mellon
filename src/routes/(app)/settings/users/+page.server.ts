import { redirect } from '@sveltejs/kit';
import { AdminApiError } from '#lib/api/index.ts';
import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { Actions, PageServerLoad } from './$types';

// Admin-eyes-only (lumen enforces 403 on every /admin/users path; this guard
// is courtesy, not security — the honest order of those two).
export const load: PageServerLoad = async ({ cookies }) => {
	const principal = await createApi(cookies.get(SESSION_COOKIE) ?? '').whoami();
	if (principal.role !== 'admin') redirect(307, '/settings');
	return { users: await createApi(cookies.get(SESSION_COOKIE) ?? '').listUsers() };
};

export const actions: Actions = {
	create: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		try {
			const created = await createApi(bearer).createUser(
				String(form.get('username') ?? '').trim(),
				form.get('role') === 'admin' ? ('admin' as const) : ('editor' as const)
			);
			return { created };
		} catch (e) {
			return { error: e instanceof AdminApiError ? e.message : 'could not create the user' };
		}
	},
	reset: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		const username = String(form.get('username') ?? '');
		try {
			const { tempPassword } = await createApi(bearer).resetUserPassword(username);
			return { resetFor: username, tempPassword };
		} catch (e) {
			return { error: e instanceof AdminApiError ? e.message : 'could not reset' };
		}
	}
};
