import { redirect } from '@sveltejs/kit';
import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	// Revoke server-side FIRST (Phase B: lumen bumps token_version — every
	// outstanding token dies, not just this browser's copy), best-effort:
	// the cookie is ours to clear even when the backend is unreachable.
	try {
		await createApi().logout();
	} catch {
		/* end session never depends on the network */
	}
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/login');
};
