import { fail, redirect } from '@sveltejs/kit';
import { AdminApiError } from '#lib/api/index.ts';
import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, cookieTrust } from '#lib/session.ts';
import type { Principal } from '#lib/api/types.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * The one wizard surface, two modes (owner naming 2026-11-11: /setup, not
 * /password — claiming the estate and setting your first real password are
 * the same story: setup).
 *
 *   register — no session + unclaimed estate: create the first admin (TOFU;
 *              lumen answers 410 Gone once claimed, so this mode dies with it)
 *   change   — session + mustChange: arrive with a temp password (admin
 *              created you, or an admin reset you), leave with your own.
 *
 * Everything else redirects: comfortable sessions go to the desk, strangers
 * on a claimed estate go to /login.
 */
export const load: PageServerLoad = async ({ cookies }) => {
	const bearer = cookies.get(SESSION_COOKIE);
	let principal: Principal | null = null;
	if (bearer) {
		try {
			principal = await createApi(bearer).whoami();
		} catch (e) {
			if (!(e instanceof AdminApiError && e.status === 401)) throw e;
		}
	}
	if (principal && !principal.mustChange) redirect(303, '/');
	const { unclaimed } = await createApi(bearer ?? '').setupStatus();
	if (!principal && !unclaimed) redirect(303, '/login');
	return principal?.mustChange
		? { mode: 'change' as const, username: principal.username }
		: { mode: 'register' as const, username: '' };
};

function setSession(
	cookies: import('@sveltejs/kit').Cookies,
	url: URL,
	token: string,
	expiresIn: number
) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		...cookieTrust(url),
		maxAge: expiresIn
	});
}

export const actions: Actions = {
	default: async ({ cookies, request, url }) => {
		const form = await request.formData();
		const mode = String(form.get('mode') ?? 'register');
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		if (password !== confirm) return fail(400, { message: 'the two passwords must agree' });

		if (mode === 'change') {
			const bearer = cookies.get(SESSION_COOKIE) ?? '';
			const current = String(form.get('current') ?? '');
			try {
				await createApi(bearer).changePassword(current, password);
			} catch (e) {
				if (e instanceof AdminApiError && e.status === 401)
					return fail(400, { message: 'the current password is not right' });
				return fail(e instanceof AdminApiError ? e.status : 500, {
					message: e instanceof AdminApiError ? e.message : 'could not change the password'
				});
			}
			// lumen revoked every session on the change (bump ships with the
			// write) — re-mint with the NEW password so the visitor lands
			// INSIDE, not back at the gate. A failed mint is never a trap:
			// /login?changed=1 says the truth and lets them in.
			try {
				const { token, expiresIn } = await createApi().login(username, password);
				setSession(cookies, url, token, expiresIn);
				redirect(303, '/');
			} catch {
				redirect(303, '/login?changed=1');
			}
		}

		try {
			const { token, expiresIn } = await createApi().registerFirstAdmin(username, password);
			setSession(cookies, url, token, expiresIn);
		} catch (e) {
			if (e instanceof AdminApiError && e.status === 410) redirect(303, '/login');
			return fail(e instanceof AdminApiError ? e.status : 500, {
				message: e instanceof AdminApiError ? e.message : 'the estate could not be claimed'
			});
		}
		redirect(303, '/');
	}
};
