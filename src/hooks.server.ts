// The inbound RED pair (2026-11-15): ONE line per request keyed on the
// SvelteKit ROUTE ID (never the raw path — flat cardinality by
// construction), status counter + duration histogram. The probes skip
// (they would flood every rate() with noise), mirroring lumen's
// middleware. The vocabulary lives in the ONE metrics registry
// (#lib/server/metrics.js) so the /metrics listener server.js serves
// sees exactly what the hooks recorded.
import type { Handle } from '@sveltejs/kit/hooks';
import { isProbe, observeInbound } from '#lib/server/metrics.js';

export const handle: Handle = async ({ event, resolve }) => {
	if (isProbe(event.url.pathname)) {
		return resolve(event);
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
