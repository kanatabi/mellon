/**
 * The open-recent cookie's CLIENT-side writer. The write used to live in the
 * `[slug]` page's server load — but a STREAMED load cannot set cookies after
 * the shell's headers are sent (the streaming ruling, 2026-11-21), so the
 * editor bumps the cookie on mount instead. Same one-behind semantics the
 * server write had (the layout reads it on the NEXT navigation), and the
 * same encoding contract as SvelteKit's `cookies.set` (URL-encoded JSON).
 * Non-secret by design: slug + title + a timestamp, read by the palette.
 */
import { RECENT_COOKIE, type RecentEntry } from './session.ts';

export function bumpRecent(slug: string, title: string): void {
	let recent: RecentEntry[];
	try {
		const raw = document.cookie.split('; ').find((c) => c.startsWith(`${RECENT_COOKIE}=`));
		const parsed = raw ? JSON.parse(decodeURIComponent(raw.slice(RECENT_COOKIE.length + 1))) : [];
		recent = Array.isArray(parsed) ? parsed : [];
	} catch {
		recent = [];
	}
	recent = [{ slug, title, at: Date.now() }, ...recent.filter((r) => r.slug !== slug)].slice(0, 8);
	document.cookie = `${RECENT_COOKIE}=${encodeURIComponent(JSON.stringify(recent))}; path=/; samesite=strict; max-age=${60 * 60 * 24 * 30}${location.protocol === 'https:' ? '; secure' : ''}`;
}
