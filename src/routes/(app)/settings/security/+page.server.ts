import { fail } from '@sveltejs/kit';
import { createApi } from '#lib/api/index.ts';
import { requireAuthed, SESSION_COOKIE } from '#lib/session.ts';
import { performPasswordChange } from '#lib/password-flow.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	return {
		// whoami doubles as the liveness check AND hands the Security card the
		// username the re-mint needs — no cookie folklore about who is signed in
		// `account`, NOT `principal` — the layout already ships `principal` and a
		// child load shadowing a parent key is a data-smell SvelteKit warns about
		account: await createApi(cookies.get(SESSION_COOKIE) ?? '').whoami()
	};
};

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
	}
};
