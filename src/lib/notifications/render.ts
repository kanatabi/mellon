/**
 * The notification-body renderer — the CLIENT half of the two-gate rule
 * (tasks-notifications plan §1.4 rule 5): lumen sanitizes on WRITE with
 * bluemonday's inline allowlist; mellon sanitizes AGAIN on render, because
 * a display string off the wire is never trusted as markup.
 *
 * The allowlist mirrors lumen's, deliberately:
 *
 *   tags:  b strong i em u s code br a span
 *   a:     href only — same-origin paths (`/x`), never `//host`, never a
 *          backslash/control-character trick the URL parser folds into `//`
 *   span:  style only — color, background-color, font-weight
 *
 * Scripts, iframes, images, event handlers and external links are stripped.
 * Titles are PLAIN text and never pass through here; `payload.url` gating
 * shares `isSameOriginPath` with the row's click-through.
 */
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'code', 'br', 'a', 'span'];

/** The only style properties the composer may send (lumen's allowlist). */
const ALLOWED_STYLE_PROPS = new Set(['color', 'background-color', 'font-weight']);

/** Values that could turn a “color” into a fetch/execution surface — the
 *  property allowlist already blocks the useful primitives, this is the
 *  belt-and-braces pass (mirrors the spirit of lumen's sanitizer). */
const UNSAFE_STYLE_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:/i;

/**
 * The same-origin path grammar, shared by the sanitizer and the panel's
 * click-through guard. A safe target starts with a single `/`; the
 * protocol-relative `//host` form is out, and backslashes / control
 * characters are refused outright because browsers normalise them into
 * slashes while resolving URLs (`/\evil` ≡ `//evil`).
 */
export function isSameOriginPath(href: string): boolean {
	if (!href.startsWith('/') || href.startsWith('//')) return false;
	// Inline scan instead of a control-character regex (eslint no-control-regex):
	// C0 controls, DEL and backslashes all let URL parsing fold a path into
	// `//host`, so the whole string is refused.
	for (let i = 0; i < href.length; i++) {
		const code = href.charCodeAt(i);
		if (code < 0x20 || code === 0x7f || code === 0x5c) return false;
	}
	return true;
}

/** Keep only the three allowed declarations; canonicalise the rest away. */
function sanitizeStyle(raw: string): string {
	const kept: string[] = [];
	for (const part of raw.split(';')) {
		const colon = part.indexOf(':');
		if (colon < 0) continue;
		const prop = part.slice(0, colon).trim().toLowerCase();
		const value = part.slice(colon + 1).trim();
		if (!ALLOWED_STYLE_PROPS.has(prop) || !value) continue;
		if (UNSAFE_STYLE_VALUE.test(value)) continue;
		kept.push(`${prop}: ${value}`);
	}
	return kept.join('; ');
}

/**
 * Sanitize one notification body to lumen's inline surface. Returns '' for
 * an empty body, so the panel can skip the prose slot entirely.
 */
export function renderNotificationBody(html: string): string {
	if (!html) return '';

	const fragment = DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR: ['href', 'style'],
		// href values must look like a same-origin path. The element walk
		// below re-checks (and removes the attribute when the regex let a
		// backslash trick through — DOMPurify can only see the raw string).
		ALLOWED_URI_REGEXP: /^\/(?!\/)/,
		// Belt-and-braces for the content-bearing elements: a forbidden
		// parent's text/children go with it instead of leaking as text.
		FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'img', 'svg', 'math'],
		RETURN_DOM_FRAGMENT: true
	});

	const doc = fragment.ownerDocument;
	if (!doc) return '';

	// The element walk enforces the two attribute rules DOMPurify cannot
	// express: href lives only on anchors (and only when same-origin), and
	// style lives only on spans (and only for the three allowed properties).
	for (const el of Array.from(fragment.querySelectorAll('*'))) {
		const tag = el.tagName.toLowerCase();
		const href = el.getAttribute('href');
		if (tag !== 'a' || href === null || !isSameOriginPath(href)) {
			el.removeAttribute('href');
		}
		const style = el.getAttribute('style');
		if (tag === 'span' && style !== null) {
			const clean = sanitizeStyle(style);
			if (clean) el.setAttribute('style', clean);
			else el.removeAttribute('style');
		} else if (style !== null) {
			el.removeAttribute('style');
		}
	}

	const holder = doc.createElement('div');
	holder.appendChild(fragment);
	return holder.innerHTML;
}
