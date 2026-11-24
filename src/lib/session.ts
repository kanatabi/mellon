import { redirect } from '@sveltejs/kit';
import type { Principal } from '#lib/api/types.ts';

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

/**
 * The cheap page-load gate (2026-11-15): a LOCAL cookie check — no lumen
 * dial — at the top of every (app) page load that dials lumen. WHY it
 * exists: SvelteKit runs layout and page loads in PARALLEL, so the
 * layout's redirect does not stop a page load's fetches — the kubelet's
 * probe on `/` (unauthenticated, every 20s) fired four 401s at lumen per
 * probe, forever (observed live in production's logs). The layout stays
 * the REAL auth (whoami per request, cookie-clear on 401); this gate just
 * keeps dead sessions from dialing before the redirect lands.
 *
 * @param {string | undefined} cookieValue
 * @param {URL} url
 * @returns {string} the bearer — the page load continues with it
 */
export function requireAuthed(cookieValue: string | undefined, url: URL): string {
	if (!isAuthed(cookieValue)) {
		redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	}
	return cookieValue as string;
}

/** Non-httpOnly preference cookies the browser may write (settings action and
 *  the palette toggle share this one write path). */
export function writeVimCookie(on: boolean): void {
	document.cookie = on
		? 'mellon_vim=1; path=/; max-age=31536000; samesite=strict'
		: 'mellon_vim=; path=/; max-age=0; samesite=strict';
}

/**
 * The COURTESY gate (the RBAC spine, 2026-11-24): the section's page
 * server redirects a scope-less principal to their landing page. This is
 * affordance, NOT enforcement — lumen 403s the API underneath regardless
 * ("the relay forwards; it never decides" — the honest order of those
 * two). Server-only: reads the bearer through whoami's fresh row read.
 */
export function requireScope(principal: Principal, scope: string, url: URL): void {
	if (!(principal.scopes?.includes(scope) ?? false)) {
		redirect(307, '/');
	}
}
