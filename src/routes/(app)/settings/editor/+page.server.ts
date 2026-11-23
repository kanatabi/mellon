import { cookieTrust, requireAuthed, SESSION_COOKIE } from '#lib/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	return {
		vim: cookies.get('mellon_vim') === '1'
	};
};

export const actions: Actions = {
	// named-only: Kit v3 forbids `default` alongside named actions ("When using
	// named actions, the default action cannot be used") — adding a default
	// silently poisoned EVERY settings POST (action_default_with_named 500,
	// found live by the owner the same hour).
	vim: async ({ cookies, request, url }) => {
		const form = await request.formData();
		// Non-httpOnly: the editor reads it at init to choose keymaps.
		if (form.get('vim') === '1') {
			cookies.set('mellon_vim', '1', {
				path: '/',
				sameSite: 'strict',
				...cookieTrust(url),
				maxAge: 31536000
			});
		} else {
			cookies.delete('mellon_vim', { path: '/', ...cookieTrust(url) });
		}
	}
};
