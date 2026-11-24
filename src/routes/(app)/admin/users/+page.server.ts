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
	},
	// the user-LIFECYCLE verbs (the RBAC round's second cut): every one
	// is a lumen verb wearing the users:manage gate; lumen's copies
	// render verbatim (the ghost-field doctrine — a permission refusal
	// is copy).
	revoke: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		const username = String(form.get('username') ?? '');
		try {
			const result = await createApi(bearer).revokeSessions(username);
			return { revoked: result };
		} catch (e) {
			return {
				manageError: e instanceof AdminApiError ? e.message : 'could not revoke sessions'
			};
		}
	},
	forceChange: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		const username = String(form.get('username') ?? '');
		try {
			await createApi(bearer).forcePasswordChange(username);
			return { forced: username };
		} catch (e) {
			return { manageError: e instanceof AdminApiError ? e.message : 'could not force the change' };
		}
	},
	disable: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		const username = String(form.get('username') ?? '');
		try {
			const result = await createApi(bearer).setUserDisabled(username, true);
			return { disabled: result };
		} catch (e) {
			return { manageError: e instanceof AdminApiError ? e.message : 'could not disable' };
		}
	},
	enable: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		const username = String(form.get('username') ?? '');
		try {
			const result = await createApi(bearer).setUserDisabled(username, false);
			return { enabled: result };
		} catch (e) {
			return { manageError: e instanceof AdminApiError ? e.message : 'could not enable' };
		}
	},
	delete: async ({ cookies, request }) => {
		const form = await request.formData();
		const bearer = cookies.get(SESSION_COOKIE) ?? '';
		const username = String(form.get('username') ?? '');
		try {
			await createApi(bearer).deleteUser(username);
			return { deleted: username };
		} catch (e) {
			// the guards' copies (self-delete 400, the last users:manage
			// holder 409) render verbatim
			return { deleteError: e instanceof AdminApiError ? e.message : 'could not delete' };
		}
	}
};
