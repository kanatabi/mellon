import { error, redirect } from '@sveltejs/kit';
import { createApi, isUpstreamConfigured, AdminApiError } from '#lib/api/index.ts';
import {
	cookieTrust,
	isAuthed,
	RECENT_COOKIE,
	SESSION_COOKIE,
	type RecentEntry
} from '#lib/session.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
	const bearer = cookies.get(SESSION_COOKIE);
	if (!isAuthed(bearer)) {
		redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	}
	// Session expiry is lumen's fact, not mellon's guess: in real mode, ask
	// the cheapest authenticated endpoint (search('') short-circuits before
	// the engine — it authenticates without searching). A 401 means the
	// bearer is DEAD (expired claim or tv revocation) — clear the cookie and
	// send the user to login; anything else (503, timeouts) is an OUTAGE and
	// must NOT log anyone out of a good session.
	// whoami (lumen GET /admin/session) replaces the old search('') probe: one
	// authenticated read that also HANDS US the identity — role gates the nav,
	// mustChange routes the forced-change users to /setup (428 is lumen's
	// transport-level lock; the portal honors it, it does not decorate it).
	// DUAL UPSTREAMS: /admin/session is a CONTROL-PLANE path (routing.ts), so
	// this ONE call rides ADMIN_URL wherever it lands — identity truth lives
	// with the users, and the users live with lumen-admin. No fan-out.
	let principal: { username: string; role: 'admin' | 'editor'; mustChange: boolean } | null = null;
	if (isUpstreamConfigured() && bearer) {
		try {
			principal = await createApi(bearer).whoami();
		} catch (e) {
			if (e instanceof AdminApiError && e.status === 401) {
				cookies.delete(SESSION_COOKIE, { path: '/', ...cookieTrust(url) });
				redirect(303, `/login?next=${encodeURIComponent(url.pathname)}&expired=1`);
			}
			if (e instanceof AdminApiError && e.status === 428) {
				redirect(303, '/setup?change=1');
			}
			if (e instanceof AdminApiError && e.status === 503) {
				error(503, 'the backend is unreachable — try again shortly');
			}
			throw e;
		}
	} else if (!isUpstreamConfigured()) {
		// dev-default mode: no upstream env wired at all — the probe rides
		// the same contract, permissively (a missing local plane leaves the
		// nav ungated rather than eating the page)
		try {
			principal = await createApi(bearer).whoami();
		} catch {
			principal = null;
		}
	}
	let recent: RecentEntry[];
	try {
		recent = JSON.parse(cookies.get(RECENT_COOKIE) ?? '[]');
	} catch {
		recent = [];
	}
	// Non-httpOnly preference cookie: the CodeMirror component reads it at init.
	const vim = cookies.get('mellon_vim') === '1';
	return { recent, vim, principal };
};
