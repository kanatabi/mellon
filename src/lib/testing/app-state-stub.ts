// Stub for the DOM test project: components under test read SvelteKit's
// `$app/state` (page + navigating) and `$app/env` (browser). The dom project
// deliberately loads no SvelteKit plugins, so these aliases stand in.
export const browser = true;
export const dev = false;
export const ssr = false;
export const version = 'test';

// A REAL URL: the list pages read `page.url.pathname`, `.search`, and
// `.searchParams` (the filter grammar rides the URL) — the old
// `{ pathname: '/' }` literal broke route-mount smoke tests.
export const page = { url: new URL('http://localhost/') };
export const navigating = { to: null, from: null };

// $app/navigation surface used by the routes (invalidateAll by the vim
// toggle; goto by the palette + guards; invalidate by the photo pages;
// beforeNavigate by the unsaved-changes guards — called at INIT). The
// signatures are parameterless on purpose: vitest doesn't typecheck, and
// the app's own typecheck reads SvelteKit's real module — only the RUNTIME
// shape matters here, and unused params would trip the house eslint.
export async function invalidateAll() {}
export async function invalidate() {}
export async function goto() {}
export function beforeNavigate() {}

// $app/forms — the enhance stub passes the action through untouched (the
// dialog tests don't submit).
export function enhance(form: unknown, submit?: unknown) {
	if (typeof submit === 'function') {
		return (submit as (o: unknown) => unknown)({ form, cancel: () => {}, controller: null });
	}
	return undefined;
}
