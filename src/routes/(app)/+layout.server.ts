import { redirect } from '@sveltejs/kit';
import { isAuthed, RECENT_COOKIE, SESSION_COOKIE, type RecentEntry } from '#lib/session.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, url }) => {
	if (!isAuthed(cookies.get(SESSION_COOKIE))) {
		redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	}
	let recent: RecentEntry[];
	try {
		recent = JSON.parse(cookies.get(RECENT_COOKIE) ?? '[]');
	} catch {
		recent = [];
	}
	// Non-httpOnly preference cookie: the CodeMirror component reads it at init.
	const vim = cookies.get('mellon_vim') === '1';
	return { recent, vim };
};
