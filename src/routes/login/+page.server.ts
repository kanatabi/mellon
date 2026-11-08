import { fail, redirect } from '@sveltejs/kit';
import { AdminApiError } from '#lib/api/index.ts';
import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { Actions } from './$types';

// If already authed, straight through to the app.
export const load = ({ cookies }) => {
	if (cookies.get(SESSION_COOKIE)) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ cookies, request, url }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		try {
			const { token } = await createApi().login(username, password);
			cookies.set(SESSION_COOKIE, token, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				maxAge: 60 * 60 * 12
			});
		} catch (e) {
			return fail(e instanceof AdminApiError ? e.status : 500, {
				message: e instanceof AdminApiError ? e.message : 'login failed'
			});
		}
		const next = String(url.searchParams.get('next') ?? '/');
		redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : '/');
	}
};
