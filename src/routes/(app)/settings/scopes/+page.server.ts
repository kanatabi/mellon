import { AdminApiError, createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, requireAuthed, requireScope } from '#lib/session.ts';
import type { Actions, PageServerLoad } from './$types';

// The SCOPE CATALOG section (the RBAC round's third cut): the
// PORTAL-MANAGED vocabulary lives HERE — the users page's assignment
// surfaces read this catalog, and onboarding a scope is a portal action
// (the spine ruling: never manual SQL). users:manage gates the whole
// page (lumen 403s the API; this is courtesy, not security).
export const load: PageServerLoad = async ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	const principal = await api.whoami();
	// the COURTESY gate (the RBAC spine): the nav hides what the principal
	// cannot open; a bookmarked URL lands on settings instead. lumen 403s
	// the API underneath regardless — affordance, not enforcement.
	requireScope(principal, 'users:manage');
	return { catalog: await api.listScopes() };
};

export const actions: Actions = {
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
	}
};
