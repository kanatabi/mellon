/**
 * The observability registry (2026-11-15) — mellon's ONE file for the
 * metric families, the timeout budgets, and the dependency mapping.
 * Plain JavaScript on purpose: the custom server (server.js) and the
 * SvelteKit hooks BOTH import it, so the /metrics listener and the
 * instrumentation share ONE prom-client Register (two copies would
 * record inbound series into a register nobody scrapes).
 *
 * Vocabulary mirrors lumen's internal/obs exactly — the estate's panels
 * sum by (service, dependency) across apps without regexes:
 *
 *   outbound_request_total{service,dependency,operation,result}
 *   outbound_request_duration_seconds{service,dependency,operation}
 *   outbound_inflight{service,dependency}
 *   http_request_total{service,method,route,status}
 *   http_request_duration_seconds{service,method,route}
 *
 * Label doctrine (the owner ruling, same as lumen): the axes are
 * `dependency` (WHICH lumen — the role split's two planes map from the
 * routing table's upstream classes), `operation` (an ENUMERATED verb
 * threaded explicitly per AdminApi call site — the wire paths embed
 * slugs/usernames/app-env pairs, so a path-derived label would be a
 * cardinality bomb), and `result` (ok|error|timeout). `route` on the
 * inbound pair is SvelteKit's ROUTE ID — flat by construction.
 */

import { Counter, Gauge, Histogram, collectDefaultMetrics, register } from 'prom-client';

export const SERVICE = 'mellon';

/** The operation vocabulary — the enumerated verbs, ONE spelling in the
 * registry (lumen's pattern). The adapter's call sites thread these
 * EXPLICITLY (the wire paths embed slugs/usernames/app-env pairs — a
 * path-derived label would be a cardinality bomb), and call()'s opts
 * type the op as this union's members: a misspelled op is a COMPILE
 * error, not a silent metrics hole. */
export const OP = {
	// session + setup + users (the control-plane desks)
	SessionMint: 'session.mint',
	SessionRead: 'session.read',
	SessionPassword: 'session.password',
	SessionLogout: 'session.logout',
	SetupStatus: 'setup.status',
	SetupRegister: 'setup.register',
	UsersList: 'users.list',
	UsersCreate: 'users.create',
	UsersReset: 'users.reset',
	// content desks (the cms plane)
	PostsList: 'posts.list',
	PostsRead: 'posts.read',
	PostsCreate: 'posts.create',
	PostsUpdate: 'posts.update',
	PostsPublish: 'posts.publish',
	PostsUnpublish: 'posts.unpublish',
	PostsDelete: 'posts.delete',
	PhotosList: 'photos.list',
	PhotosRead: 'photos.read',
	PhotosUpdate: 'photos.update',
	PhotosUpload: 'photos.upload',
	PhotosReferences: 'photos.references',
	PhotosDelete: 'photos.delete',
	CollectionsList: 'collections.list',
	CollectionsCreate: 'collections.create',
	TagsList: 'tags.list',
	TagsNewest: 'tags.newest',
	TagsSearch: 'tags.search',
	TagsBulk: 'tags.bulk',
	TagsCreate: 'tags.create',
	TagsUpdate: 'tags.update',
	TagsDelete: 'tags.delete',
	SearchQuery: 'search.query',
	// the secrets plane (the §9 relay's verbs)
	BaoPaths: 'bao.paths',
	BaoRead: 'bao.read',
	BaoMeta: 'bao.meta',
	BaoWrite: 'bao.write',
	BaoOnboard: 'bao.onboard',
	BaoAddEnv: 'bao.add-env',
	BaoPin: 'bao.pin',
	BaoUnpin: 'bao.unpin',
	BaoSummary: 'bao.summary'
};

/**
 * The op-name union — what call()'s opts accept (JSDoc: TS syntax cannot
 * live in a plain-JS module).
 *
 * @typedef {typeof OP[keyof typeof OP]} OpName
 */

/** The routing table's upstream classes (routing.ts's UpstreamClass:
 * 'admin' | 'cms' — a type, not a runtime value, so the labels key on the
 * literals) → the dependency labels. The dual upstream IS mellon's whole
 * topology — a slow secrets write and a slow content read are DIFFERENT
 * problems on DIFFERENT planes. */
export const DEP = {
	admin: 'lumen-admin',
	cms: 'lumen-cms'
};

/**
 * The timeout table — the budgets that bound every outbound call
 * (AbortSignal.timeout; a hung lumen dies at the deadline instead of
 * hanging the desk). Env overrides read `MELLON_TIMEOUT_LUMEN_ADMIN` /
 * `MELLON_TIMEOUT_LUMEN_CMS` (dep default) and `..._<OP_PIECE>` (per-op),
 * in MILLISECONDS. Missing, empty, or garbage value = the table default —
 * the same missing-or-empty-means-default rule lumen's viper config
 * follows natively.
 *
 * @type {Record<string, { default: number, ops?: Record<string, number> }>}
 */
export const TIMEOUT_TABLE = {
	[DEP.admin]: { default: 5000 },
	[DEP.cms]: {
		default: 5000,
		ops: {
			// the 100 MB upload over a slow uplink: ~4.5 Mbps sustained. The
			// old 30s budget killed real uploads mid-flight.
			[OP.PhotosUpload]: 180000
		}
	}
};

/** op name → the env piece: `photos.upload` → `PHOTOS_UPLOAD`.
 *
 * @param {string} op
 * @returns {string}
 */
export function opPiece(op) {
	return op.toUpperCase().replaceAll('.', '_').replaceAll('-', '_');
}

/**
 * The effective budget AFTER env overrides — what outbound() actually
 * applies. Precedence: the per-op env wins, then the dep env, then the
 * table.
 *
 * @param {string} dependency
 * @param {string} operation
 * @returns {number}
 */
export function effectiveTimeout(dependency, operation) {
	const depKey = `MELLON_TIMEOUT_${dependency.toUpperCase().replaceAll('-', '_')}`;
	const opKey = `${depKey}_${opPiece(operation)}`;
	const opRaw = process.env[opKey];
	if (opRaw !== undefined && opRaw !== '') {
		const parsed = Number.parseInt(opRaw, 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	const depRaw = process.env[depKey];
	if (depRaw !== undefined && depRaw !== '') {
		const parsed = Number.parseInt(depRaw, 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	const entry = TIMEOUT_TABLE[dependency];
	if (!entry) return 5000; // an unregistered dep still gets a sane bound
	return entry.ops?.[operation] ?? entry.default;
}

/**
 * @param {string} dependency
 * @returns {string[]}
 */
export function timeoutEnvKeys(dependency) {
	const entry = TIMEOUT_TABLE[dependency];
	if (!entry) return [];
	const depKey = `MELLON_TIMEOUT_${dependency.toUpperCase().replaceAll('-', '_')}`;
	return [depKey, ...Object.keys(entry.ops ?? {}).map((op) => `${depKey}_${opPiece(op)}`)];
}

// THE ONE REGISTER is prom-client's DEFAULT global registry — a deliberate
// choice, not a shortcut: the runtime executes this module's SOURCE copy
// (server.js imports it) AND the build's bundled chunk (the hooks chain
// imports that) — two module instances. With per-instance `new Registry()`
// the hooks' observations never reached the /metrics listener (the smoke
// test caught exactly that). The DEFAULT registry is a property of the
// prom-client module itself, which the SSR build EXTERNALIZES (real
// dependency → resolved from node_modules at runtime) — so every copy
// shares ONE instance. Re-exported for server.js.
//
// Two copies also mean the DEFINITIONS run twice — hence define(): the
// first instance wins, the second reuses its metrics (double-registration
// would throw at boot). collectDefaultMetrics is guarded the same way.
export { register };
register.setDefaultLabels({ service: SERVICE });

/**
 * @param {string} name
 * @param {() => import('prom-client').Metric<string>} factory
 * @returns {import('prom-client').Metric<string>}
 */
function define(name, factory) {
	return register.getSingleMetric(name) ?? factory();
}

if (!register.getSingleMetric('process_cpu_user_seconds_total')) collectDefaultMetrics();

const OUTBOUND_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];
const INBOUND_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const outboundTotal = /** @type {Counter} */ (
	define(
		'outbound_request_total',
		() =>
			new Counter({
				name: 'outbound_request_total',
				help: 'Outbound call outcomes (result=ok|error|timeout).',
				labelNames: ['dependency', 'operation', 'result']
			})
	)
);
export const outboundDuration = /** @type {Histogram} */ (
	define(
		'outbound_request_duration_seconds',
		() =>
			new Histogram({
				name: 'outbound_request_duration_seconds',
				help: 'Latency of outbound calls, by dependency and operation.',
				labelNames: ['dependency', 'operation'],
				buckets: OUTBOUND_BUCKETS
			})
	)
);
export const outboundInflight = /** @type {Gauge} */ (
	define(
		'outbound_inflight',
		() =>
			new Gauge({
				name: 'outbound_inflight',
				help: 'Outbound calls currently in flight, by dependency.',
				labelNames: ['dependency']
			})
	)
);

export const httpRequestTotal = /** @type {Counter} */ (
	define(
		'http_request_total',
		() =>
			new Counter({
				name: 'http_request_total',
				help: 'Inbound requests by SvelteKit route ID (never raw paths).',
				labelNames: ['method', 'route', 'status']
			})
	)
);
export const httpRequestDuration = /** @type {Histogram} */ (
	define(
		'http_request_duration_seconds',
		() =>
			new Histogram({
				name: 'http_request_duration_seconds',
				help: 'Inbound request latency by route ID.',
				labelNames: ['method', 'route'],
				buckets: INBOUND_BUCKETS
			})
	)
);

/**
 * The outbound wrapper — the seam every lumen call rides: the budget
 * comes from the timeout table (env overridable), the latency histogram +
 * outcome counter + in-flight gauge record the call, and the wrapped fn
 * receives the ABORT signal so a hung lumen dies at the deadline instead
 * of hanging the desk.
 *
 * Outcome semantics mirror lumen exactly: a RESOLVED response is `ok`
 * even when it carries a 5xx (the transport succeeded; the status is the
 * caller's story — the access line + AdminApiError carry it); a thrown
 * error while the budget expired is `timeout`; any other throw is
 * `error`. The error ALWAYS rethrows — instrumentation never swallows.
 *
 * @template T
 * @param {string} dependency
 * @param {string} operation
 * @param {(signal: AbortSignal) => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function outbound(dependency, operation, run) {
	const budgetMs = effectiveTimeout(dependency, operation);
	const signal = AbortSignal.timeout(budgetMs);

	const start = performance.now();
	outboundInflight.inc({ dependency });
	let result = 'ok';
	try {
		return await run(signal);
	} catch (err) {
		result = classify(signal, err);
		throw err;
	} finally {
		outboundInflight.dec({ dependency });
		outboundDuration.observe({ dependency, operation }, secondsSince(start));
		outboundTotal.inc({ dependency, operation, result });
	}
}

/**
 * @param {number} startMs
 * @returns {number}
 */
function secondsSince(startMs) {
	return (performance.now() - startMs) / 1000;
}

/** timeout iff MY budget expired: my signal aborted with a TimeoutError
 * reason, or the thrown error IS the deadline surfacing. Everything else
 * that throws (ECONNREFUSED, JSON parse, a caller bug) is plain error.
 *
 * @param {AbortSignal} signal
 * @param {unknown} err
 * @returns {'ok' | 'error' | 'timeout'}
 */
function classify(signal, err) {
	const timeoutReason =
		signal.aborted &&
		signal.reason &&
		/** @type {{ name?: string }} */ (signal.reason).name === 'TimeoutError';
	const errIsTimeout = err && /** @type {{ name?: string }} */ (err).name === 'TimeoutError';
	return timeoutReason || errIsTimeout ? 'timeout' : 'error';
}

/** The probe paths — the hook skips them (they would flood every rate()
 * with noise), mirroring lumen's middleware.
 *
 * @param {string} pathname
 */
export function isProbe(pathname) {
	return pathname === '/healthz' || pathname === '/readyz';
}

/**
 * The inbound RED pair — called from the SvelteKit `handle` hook after
 * the response resolves. `route` is event.route.id (SvelteKit's pattern);
 * null route (no page matched) records `unmatched` — the honest series,
 * never a raw path.
 *
 * @param {string | null} routeId
 * @param {string} method
 * @param {number} status
 * @param {number} durationMs
 */
export function observeInbound(routeId, method, status, durationMs) {
	const route = routeId ?? 'unmatched';
	httpRequestDuration.observe({ method, route }, durationMs / 1000);
	httpRequestTotal.inc({ method, route, status: String(status) });
}
