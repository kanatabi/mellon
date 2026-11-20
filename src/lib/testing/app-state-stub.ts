// Stub for the DOM test project: components under test read SvelteKit's
// `$app/state` (page + navigating) and `$app/env` (browser). The dom project
// deliberately loads no SvelteKit plugins, so these aliases stand in.
export const browser = true;
export const dev = false;
export const ssr = false;
export const version = 'test';

export const page = { url: { pathname: '/' } };
export const navigating = { to: null, from: null };

// $app/navigation surface used by the shell (invalidateAll is called by the
// vim toggle; goto by the palette commands).
export async function invalidateAll() {}
export async function goto() {}
