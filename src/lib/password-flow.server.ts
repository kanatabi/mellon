import type { Cookies } from '@sveltejs/kit';
import { AdminApiError, createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE, cookieTrust } from '#lib/session.ts';

/**
 * The one password-change flow (IA round 2026-11-11): /setup's forced-change
 * mode and /settings' voluntary rotate both run THIS — change → lumen revokes
 * every session (bump ships with the write) → transparently re-mint with the
 * new password → swap the cookie. One flow means the "land them INSIDE, not
 * back at the gate" behavior can't drift between the two doors.
 * Returns a renderable result instead of redirecting so callers own their
 * success path; a failed re-mint is `loginAgain:false` — the password IS
 * changed, only the session needs re-entry.
 */
export async function performPasswordChange(opts: {
	cookies: Cookies;
	url: URL;
	username: string;
	current: string;
	next: string;
	confirm: string;
}): Promise<{ ok: true; loginAgain: boolean } | { ok: false; status: number; message: string }> {
	const { cookies, url, username, current, next, confirm } = opts;
	if (next !== confirm) return { ok: false, status: 400, message: 'The two passwords must agree' };
	const bearer = cookies.get(SESSION_COOKIE) ?? '';
	try {
		await createApi(bearer).changePassword(current, next);
	} catch (e) {
		if (e instanceof AdminApiError)
			return {
				ok: false,
				status: e.status === 401 ? 400 : e.status,
				message: e.status === 401 ? 'The current password is not right' : e.message
			};
		return { ok: false, status: 500, message: 'Could not change the password' };
	}
	try {
		const { token, expiresIn } = await createApi().login(username, next);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			...cookieTrust(url),
			maxAge: expiresIn
		});
		return { ok: true, loginAgain: false };
	} catch {
		return { ok: true, loginAgain: true }; // changed, just re-enter
	}
}
