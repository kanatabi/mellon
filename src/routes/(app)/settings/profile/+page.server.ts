import { fail } from '@sveltejs/kit';
import { AdminApiError, createApi } from '#lib/api/index.ts';
import { requireAuthed, SESSION_COOKIE } from '#lib/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	return { profile: await createApi(cookies.get(SESSION_COOKIE) ?? '').profile() };
};

export const actions: Actions = {
	profile: async ({ cookies, request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const email = String(form.get('email') ?? '');
		try {
			await createApi(cookies.get(SESSION_COOKIE) ?? '').updateProfile(name, email);
			// The layout's principal (name/email in the account menu) refreshes
			// through invalidateAll on the page — one source, no local echo.
			return { ok: true as const };
		} catch (e) {
			return fail(e instanceof AdminApiError ? e.status : 500, {
				message: e instanceof AdminApiError ? e.message : 'could not save the profile'
			});
		}
	}
};
