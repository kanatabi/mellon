/**
 * Session plumbing. REAL sessions are minted by lumen (Phase B) — in mock mode
 * mellon issues its own opaque token so the full auth flow is exercisable now.
 * The browser-side contract is identical either way: one httpOnly cookie.
 */
export const SESSION_COOKIE = 'mellon_session';
export const RECENT_COOKIE = 'mellon_recent';
export const RECENT_MAX = 8;

/**
 * Cookie `secure` MUST follow the real transport. SvelteKit defaults it to
 * TRUE, and browsers flatly refuse to store a Secure cookie on any plain-HTTP
 * origin — which silently broke portal login on the local cluster rehearsal
 * (http://console.gofar.id:30080) while the Playwright harness never noticed:
 * Chromium exempts localhost from the rule. Behind Traefik the Deployment sets
 * PROTOCOL_HEADER=x-forwarded-proto + HOST_HEADER=x-forwarded-host (adapter-
 * node's opt-in origin reconstruction), so event.url reflects reality: the
 * https console keeps Secure automatically; http dev gets a browser-legal
 * cookie. NEVER hardcode secure — set and delete must agree, or the delete is
 * refused exactly like the set was (hence this single helper, used everywhere).
 */
export function cookieTrust(url: URL) {
	return { secure: url.protocol === 'https:' };
}

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
