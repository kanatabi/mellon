// The inbound RED pair (2026-11-15): ONE line per request keyed on the
// SvelteKit ROUTE ID (never the raw path — flat cardinality by
// construction), status counter + duration histogram. The probes skip
// (they would flood every rate() with noise), mirroring lumen's
// middleware. The vocabulary lives in the ONE metrics registry
// (#lib/server/metrics.js) so the /metrics listener server.js serves
// sees exactly what the hooks recorded.
import type { Handle } from '@sveltejs/kit/hooks';
import { json } from '@sveltejs/kit';
import { isProbe, observeInbound } from '#lib/server/metrics.js';
import { GENERAL_BODY_LIMIT } from '#lib/upload.ts';

export const handle: Handle = async ({ event, resolve }) => {
	if (isProbe(event.url.pathname)) {
		return resolve(event);
	}
	// The body ceiling (the upload round): adapter-node's BODY_SIZE_LIMIT is
	// raised image-level for the photo wire, so THIS is the guard that keeps
	// the raised ceiling off every other route — a 100 MB body must never
	// reach a JSON parse. The photo door (POST /api/photos) is the one
	// exempt: its multipart streams through the relay unparsed (413s are
	// the relay's own pre-check, with the formatted copy).
	const len = Number(event.request.headers.get('content-length') ?? '0');
	if (
		len > GENERAL_BODY_LIMIT &&
		!(event.request.method === 'POST' && event.url.pathname === '/api/photos')
	) {
		return json({ error: 'request body too large' }, { status: 413 });
	}
	const start = performance.now();
	const res = await resolve(event);
	observeInbound(
		event.route?.id ?? null,
		event.request.method,
		res.status,
		performance.now() - start
	);
	return res;
};

// THE BOOT WARM-UP (2026-11-22): the preview's markdown engine = the
// seconds of sync, event-loop-freezing CPU on its first build — pay it at
// the pod's STARTUP, never on the owner's first typing burst after a
// deploy (the cold-engine walk — earendil's twin). The render module is
// DYNAMICALLY imported by the relay route, so the hooks = the only eager
// touchpoint that can start the build off the request path.
import('#lib/preview/render.ts')
	.then((m) => m.warmup())
	.then(() => console.log('[boot] markdown engine warm'))
	.catch(() => {}); // the failure surfaces on the first render (the engine's own retry)
