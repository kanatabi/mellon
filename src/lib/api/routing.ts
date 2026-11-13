/**
 * The dual-upstream routing table (lumen role split, 2026-11-13) — ONE
 * auditable file answering "which lumen gets this call?". A portal
 * deployment carries TWO upstreams:
 *
 *   ADMIN_URL — the CONTROL PLANE (lumen-admin, in-cluster, always). It
 *               holds the users: sessions, TOFU setup, user admin, and the
 *               Bao secrets plane. Content portals cannot mint or revoke
 *               identities; only this one can.
 *   CMS_URL   — this env's CONTENT lumen (posts/photos/tags/collections/
 *               media/search, and the public /api* passthroughs). dev
 *               default = the single binary on :8080, so plain `make dev`
 *               keeps working with zero extra wiring.
 *
 * The table keys on the lumen WIRE path (what the fetch-adapter ships),
 * segment-boundary aware: `/admin/session` matches `/admin/session/password`
 * but NEVER `/admin/sessions-archive`. Unknown paths fail LOUDLY — there is
 * no default-to-admin: a mis-routed secrets call riding the content plane
 * (or vice versa) is a security story, so the router refuses instead of
 * guessing. The two portals are the SAME image with different envs; only
 * this table + the env resolution decide what talks to what.
 */

export type UpstreamClass = 'admin' | 'cms';

export interface RouteClass {
	/** Lumen wire path prefix (segment-boundary aware, see above). */
	prefix: string;
	upstream: UpstreamClass;
	/** Why this class — the audit line a reviewer reads. */
	note: string;
}

/**
 * THE ROUTE-CLASS TABLE. Pinned by routing.test.ts per route class; the
 * docs/vortex siblings seed their kv keys from exactly this shape.
 */
export const ROUTE_TABLE: RouteClass[] = [
	// --- CONTROL PLANE → ADMIN_URL (it holds the users; everything that
	//     mints, reads, or revokes identity, plus the Bao secrets plane) ---
	{
		prefix: '/admin/session',
		upstream: 'admin',
		note: 'login, verify/whoami, password change, logout'
	},
	{
		prefix: '/admin/users',
		upstream: 'admin',
		note: 'user list/create, server-generated temp passwords'
	},
	{
		prefix: '/admin/setup',
		upstream: 'admin',
		note: 'TOFU wizard: unclaimed probe + first-admin register'
	},
	{
		prefix: '/admin/bao',
		upstream: 'admin',
		note: 'matrix/summary, vault read/write, pins, apps/envs, paths'
	},
	// --- CMS PLANE → CMS_URL (this env's lumen; anything content-shaped) ---
	{ prefix: '/admin/posts', upstream: 'cms', note: 'the desk: list/CAS/publish/delete' },
	{ prefix: '/admin/photos', upstream: 'cms', note: 'multipart upload relay + curation' },
	{
		prefix: '/admin/tags',
		upstream: 'cms',
		note: 'vocabulary desk incl. /tags/search, /tags/bulk'
	},
	{ prefix: '/admin/collections', upstream: 'cms', note: 'collection vocabulary' },
	{ prefix: '/admin/media', upstream: 'cms', note: 'media passthrough' },
	{
		prefix: '/admin/search',
		upstream: 'cms',
		note: 'palette content door — content-shaped, not identity'
	},
	{ prefix: '/api', upstream: 'cms', note: 'public passthroughs: posts/search/suggest/feed' }
];

/**
 * Raised on a path the table does not classify — a deploy/contract bug, not
 * a transport story, so it surfaces raw (the relay renders it as a 500).
 * It never silently falls through to either upstream.
 */
export class RoutingError extends Error {
	constructor(path: string) {
		super(`routing-table: no upstream class for "${path}" — refusing (there is no default)`);
		this.name = 'RoutingError';
	}
}

/** Boundary-aware prefix match: equal, or the prefix plus a path segment. */
function covers(prefix: string, path: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

/** Which upstream class owns this lumen wire path. Throws RoutingError when
 *  the table says nothing — loud refusal, no default-to-admin. */
export function upstreamFor(path: string): UpstreamClass {
	let best: RouteClass | undefined;
	for (const entry of ROUTE_TABLE) {
		if (!covers(entry.prefix, path)) continue;
		// longest prefix wins (future-proofing: an entry may specialize another)
		if (!best || entry.prefix.length > best.prefix.length) best = entry;
	}
	if (!best) throw new RoutingError(path);
	return best.upstream;
}

/** Pick the base URL for a path from a resolved upstream pair. */
export function baseFor<T>(path: string, bases: { admin: T; cms: T }): T {
	return bases[upstreamFor(path)];
}
