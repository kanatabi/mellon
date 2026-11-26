import { fail } from '@sveltejs/kit';
import { AdminApiError, createApi } from '#lib/api/index.ts';
import { requireAuthed, SESSION_COOKIE } from '#lib/session.ts';
import { performPasswordChange } from '#lib/password-flow.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	// the cheap gate first: a dead session never dials lumen (the
	// layout's redirect runs in parallel and cannot stop these fetches)
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	// the roster is a nice-to-have: lumen without the webauthn env (or a
	// 401 race) renders an empty card honestly — never a dead settings page
	const passkeys = await api.passkeys().then(
		(r) => r.passkeys,
		() => [] as { id: string; label: string; createdAt: string; lastUsedAt: string }[]
	);
	return {
		// whoami doubles as the liveness check AND hands the Security card the
		// username the re-mint needs — no cookie folklore about who is signed in
		// `account`, NOT `principal` — the layout already ships `principal` and a
		// child load shadowing a parent key is a data-smell SvelteKit warns about
		account: await api.whoami(),
		passkeys
	};
};

export const actions: Actions = {
	// the PASSKEY machine (the auth-method seam, C1): begin returns the
	// WebAuthn creation options (the BROWSER owns the ceremony); finish
	// relays the attestation to lumen and stores the credential bound to
	// the session's user. Registering never bumps token_version — it
	// changes what can AUTHENTICATE, not what the session may do.
	passkeyRegisterBegin: async ({ cookies }) => {
		try {
			return await createApi(cookies.get(SESSION_COOKIE) ?? '').passkeyRegisterBegin();
		} catch (e) {
			return fail(400, {
				pk: { message: e instanceof AdminApiError ? e.message : 'passkeys unavailable' }
			});
		}
	},
	passkeyRegisterFinish: async ({ cookies, request }) => {
		const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
		const body = await request.json().catch(() => null);
		if (!body?.state || !body?.response || !body?.label) {
			return fail(400, { pk: { message: 'passkey ceremony incomplete' } });
		}
		try {
			const { passkey } = await api.passkeyRegisterFinish(
				String(body.state),
				String(body.label),
				body.response
			);
			return { pk: { ok: true as const, passkey } };
		} catch (e) {
			return fail(e instanceof AdminApiError ? e.status : 500, {
				pk: { message: e instanceof AdminApiError ? e.message : 'passkey registration failed' }
			});
		}
	},
	passkeyDelete: async ({ cookies, request }) => {
		const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		try {
			await api.passkeyDelete(id);
			return { pkDelete: { ok: true as const, id } };
		} catch (e) {
			return fail(e instanceof AdminApiError ? e.status : 500, {
				pkDelete: { message: e instanceof AdminApiError ? e.message : 'delete failed' }
			});
		}
	},
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
