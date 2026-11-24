import { redirect } from '@sveltejs/kit';
import { AdminApiError } from '#lib/api/index.ts';
import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, requireAuthed } from '#lib/session.ts';
import type { Actions, PageServerLoad } from './$types';

// Admin-eyes-only (lumen enforces 403 on every /admin/users path; this guard
// is courtesy, not security — the honest order of those two).
export const load: PageServerLoad = async ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	const bearer = cookies.get(SESSION_COOKIE) ?? '';
	const api = createApi(bearer);
	const principal = await api.whoami();
	// users:manage gates the WHOLE page (lumen 403s the list; this is
	// courtesy, not security — the honest order of those two)
	if (!(principal.scopes?.includes('users:manage') ?? false)) redirect(307, '/settings');
	return {
		users: await api.listUsers(),
		catalog: await api.listScopes(),
		// the assigner's own scopes decide which rows the page dares render
		// (courtesy rendering; lumen enforces the verbs regardless)
		self: principal
	};
};

export const actions: Actions = {
	create: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		try {
			// the picker IS the grant (roles are gone — the spine ruling):
			// every checked scope rides the formData as a repeated field
			const created = await createApi(bearer).createUser(
				String(form.get('username') ?? '').trim(),
				form.getAll('scopes').map(String)
			);
			return { created };
		} catch (e) {
			return { error: e instanceof AdminApiError ? e.message : 'could not create the user' };
		}
	},
	// the RBAC spine's write: REPLACE the user's scope set (the admin's
	// assignment is the whole truth); lumen bumps token_version — the
	// user's other sessions die, and the copy says so
	scopes: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		const username = String(form.get('username') ?? '');
		try {
			const result = await createApi(bearer).updateUserScopes(
				username,
				form.getAll('scopes').map(String)
			);
			return { scopesSet: result };
		} catch (e) {
			return { error: e instanceof AdminApiError ? e.message : 'could not set scopes' };
		}
	},
	scopeAdd: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		try {
			const entry = await createApi(bearer).addScope(
				String(form.get('scope') ?? '').trim(),
				String(form.get('description') ?? '').trim()
			);
			return { scopeAdded: entry };
		} catch (e) {
			return { scopeError: e instanceof AdminApiError ? e.message : 'could not add the scope' };
		}
	},
	scopeDelete: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		const scope = String(form.get('scope') ?? '');
		try {
			await createApi(bearer).deleteScope(scope);
			return { scopeDeleted: scope };
		} catch (e) {
			// lumen's refusal renders VERBATIM (ghost-field): the 409 copy
			// carries the holder counts — never paraphrased
			return { scopeError: e instanceof AdminApiError ? e.message : 'could not delete the scope' };
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
