import { fail, redirect } from '@sveltejs/kit';
import { AdminApiError } from '#lib/api/index.ts';
import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, cookieTrust } from '#lib/session.ts';
import type { Actions } from './$types';

// The gate checks the door state BEFORE asking for credentials: an UNCLAIMED
// estate has no login story — /setup is the front door until it self-disables.
export const load = async ({ cookies }: { cookies: import('@sveltejs/kit').Cookies }) => {
	if (cookies.get(SESSION_COOKIE)) redirect(303, '/');
	try {
		const { unclaimed } = await createApi().setupStatus();
		if (unclaimed) redirect(303, '/setup');
	} catch (e) {
		// an outage on the probe must NOT eat the login page (layout doctrine:
		// never log anyone out of a good session on transport noise) — but a
		// lumen WITHOUT the endpoint (pre-wizard image) is honest absence too
		if (!(e instanceof AdminApiError && (e.status === 404 || e.status >= 500))) throw e;
	}
};

export const actions: Actions = {
	default: async ({ cookies, request, url }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		// redirect() THROWS — keep it OUT of the try or the catch turns a
		// successful login into a fabricated 500 (a bug with a short memory)
		let mustChange: boolean; // assigned in try (catch returns: flow is honest)
		try {
			// the SERVER decides session length (expiresIn, seconds — lumen §8);
			// the cookie follows the token, never the other way around
			const { token, expiresIn, mustChange: mc } = await createApi().login(username, password);
			mustChange = mc;
			cookies.set(SESSION_COOKIE, token, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				...cookieTrust(url),
				maxAge: expiresIn
			});
		} catch (e) {
			return fail(e instanceof AdminApiError ? e.status : 500, {
				message: e instanceof AdminApiError ? e.message : 'login failed'
			});
		}
		// temp-password arrivals go straight to the guided change — the cookie
		// is set first so /setup can whoami them through it; otherwise the
		// session's destination is the page that bounced to login (same-origin
		// paths only: `//host` and absolute URLs are NOT next-hop material)
		if (mustChange) redirect(303, '/setup?change=1');
		const next = String(url.searchParams.get('next') ?? '/');
		redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : '/');
	}
};
