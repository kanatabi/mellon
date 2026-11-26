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
	// the PASSKEY LOGIN (the auth-method seam, C1): begin returns the
	// WebAuthn options (the browser owns the ceremony); finish relays the
	// assertion to lumen and sets the SAME cookie the password login
	// sets — one mint, one cookie path, two authenticator kinds.
	passkeyBegin: async () => {
		try {
			return await createApi().passkeyLoginBegin();
		} catch (e) {
			return fail(400, {
				message: e instanceof AdminApiError ? e.message : 'passkeys unavailable'
			});
		}
	},
	passkeyFinish: async ({ cookies, request, url }) => {
		const body = await request.json().catch(() => null);
		if (!body?.state || !body?.response)
			return fail(400, { message: 'passkey ceremony incomplete' });
		let mustChange: boolean;
		try {
			const {
				token,
				expiresIn,
				mustChange: mc
			} = await createApi().passkeyLoginFinish(String(body.state), body.response);
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
				message: e instanceof AdminApiError ? e.message : 'passkey login failed'
			});
		}
		if (mustChange) redirect(303, '/setup?change=1');
		const next = String(url.searchParams.get('next') ?? '/');
		redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : '/');
	},
	// NAMED (the auth-method seam): with named actions present, Kit's
	// default action is UNREACHABLE (action_default_with_named) — every
	// login method is a named action: password, passkey, oauth later.
	password: async ({ cookies, request, url }) => {
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
