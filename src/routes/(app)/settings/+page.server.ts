import { redirect } from '@sveltejs/kit';
import { requireAuthed, SESSION_COOKIE } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

/** `/settings` is the SHELL's address — the sections live in child routes.
 *  Redirect to the first one (no overview page to maintain). The cheap
 *  gate stays: every (app) page load opens with requireAuthed — the
 *  auth-gate guard test walks every +page.server.ts, and a redirect that
 *  skips the gate would be the one exception (uniformity beats "it cannot
 *  dial anyway"). */
export const load: PageServerLoad = ({ cookies, url }) => {
	requireAuthed(cookies.get(SESSION_COOKIE), url);
	redirect(307, '/settings/appearance');
};
