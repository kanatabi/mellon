import { fail } from '@sveltejs/kit';
import { createApi } from '#lib/api/index.ts';
import { cookieTrust, SESSION_COOKIE } from '#lib/session.ts';
import { performPasswordChange } from '#lib/password-flow.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => ({
	vim: cookies.get('mellon_vim') === '1',
	// whoami doubles as the liveness check AND hands the Security card the
	// username the re-mint needs — no cookie folklore about who is signed in
	// `account`, NOT `principal` — the layout already ships `principal` and a
	// child load shadowing a parent key is a data-smell SvelteKit warns about
	account: await createApi(cookies.get(SESSION_COOKIE) ?? '').whoami()
});

export const actions: Actions = {
	password: async ({ cookies, request, url }) => {
		const form = await request.formData();
		const res = await performPasswordChange({
			cookies,
			url,
			username: String(form.get('username') ?? ''),
			current: String(form.get('current') ?? ''),
			next: String(form.get('next') ?? ''),
			confirm: String(form.get('confirm') ?? '')
		});
		if (!res.ok) return fail(res.status, { pw: res });
		return { pw: { ok: true as const, loginAgain: res.loginAgain } };
	},
	default: async ({ cookies, request, url }) => {
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
