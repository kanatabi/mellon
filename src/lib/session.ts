/**
 * Session plumbing. REAL sessions are minted by lumen (Phase B) — in mock mode
 * mellon issues its own opaque token so the full auth flow is exercisable now.
 * The browser-side contract is identical either way: one httpOnly cookie.
 */
export const SESSION_COOKIE = 'mellon_session';
export const RECENT_COOKIE = 'mellon_recent';
export const RECENT_MAX = 8;

export interface RecentEntry {
	slug: string;
	title: string;
	at: number;
}

export function isAuthed(cookieValue: string | undefined): boolean {
	return typeof cookieValue === 'string' && cookieValue.length > 0;
}

/** Non-httpOnly preference cookies the browser may write (settings action and
 *  the palette toggle share this one write path). */
export function writeVimCookie(on: boolean): void {
	document.cookie = on
		? 'mellon_vim=1; path=/; max-age=31536000; samesite=strict'
		: 'mellon_vim=; path=/; max-age=0; samesite=strict';
}
