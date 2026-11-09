/**
 * The real-transport AdminApi (Phase C): every method maps 1:1 onto lumen's
 * §8/§9 routes — the adapter SHIPS the wire, it decides nothing (doctrine:
 * the relay forwards, never decides). Errors surface as AdminApiError with
 * lumen's status codes verbatim; the UI's conflict branches read them.
 *
 * Token handling mirrors the design: the bearer IS the mellon session cookie;
 * createApi receives it per call-site (loads/actions/relay all run in request
 * context). No token storage here, no refresh logic — expiry is lumen's
 * 12h claim, revocation is its token_version row, both invisible to this file.
 */
import { AdminApiError } from './types.ts';
import type {
	AdminApi,
	AdminPhoto,
	CollectionCount,
	Paged,
	PhotoListOpts,
	PostDetailAdmin,
	PostDraft,
	PostSummaryAdmin,
	PostListOpts,
	SecretMeta,
	SecretPayload,
	SecretPath,
	SearchResults,
	TagCount
} from './types.ts';

/** Local-dev fallback when API_BASE is unset — the cluster always overrides.
 *  Real-by-default (owner ruling 2026-11-09): there is no runtime mock path. */
export const DEV_DEFAULT_API_BASE = 'http://localhost:8080';

export function createLumenApi(base: string, bearer: string): AdminApi {
	async function call<T>(
		method: string,
		path: string,
		opts: { query?: Record<string, string[]>; body?: unknown; nullOn404?: boolean } = {}
	): Promise<T> {
		const url = new URL(base + path);
		for (const [k, vs] of Object.entries(opts.query ?? {}))
			for (const v of vs) url.searchParams.append(k, v);
		let res: Response;
		try {
			res = await fetch(url, {
				method,
				headers: {
					...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
					...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {})
				},
				body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
			});
		} catch {
			// lumen unreachable is a 503 story, never a fake success and never
			// a 401 (an outage must not clear good session cookies)
			throw new AdminApiError(503, 'lumen unreachable');
		}
		if (res.status === 404 && opts.nullOn404) return null as T;
		const text = await res.text();
		if (!res.ok) {
			let message = `HTTP ${res.status}`;
			try {
				const j = JSON.parse(text) as { error?: string };
				if (j.error) message = j.error;
			} catch {
				/* non-JSON error body: status line is the message */
			}
			throw new AdminApiError(res.status, message);
		}
		return (text ? JSON.parse(text) : undefined) as T;
	}

	const q = (o: Record<string, string | number | boolean | string[] | undefined | null>) => {
		const m: Record<string, string[]> = {};
		for (const [k, v] of Object.entries(o))
			if (v !== undefined && v !== null && v !== '') m[k] = Array.isArray(v) ? v : [String(v)];
		return m;
	};

	return {
		// --- session ---
		login: (username, password) =>
			call<{ token: string; expiresIn: number }>('POST', '/admin/session', {
				body: { username, password }
			}),
		// DELETE is 204-no-body; call() returns undefined for empty text
		logout: () => call<void>('DELETE', '/admin/session'),

		// --- posts (§8) ---
		listPosts: (o?: PostListOpts) =>
			call<Paged<PostSummaryAdmin>>('GET', '/admin/posts', {
				query: q({
					status: o?.status,
					tag: o?.tag,
					from: o?.from,
					to: o?.to,
					sort: o?.sort,
					dir: o?.dir,
					page: o?.page
				})
			}),
		getPost: (slug) => call<PostDetailAdmin>('GET', `/admin/posts/${encodeURIComponent(slug)}`),
		createPost: (draft: PostDraft) =>
			call<PostDetailAdmin>('POST', '/admin/posts', { body: draft }),
		updatePost: (slug, draft: PostDraft, rev: number) =>
			call<PostDetailAdmin>('PUT', `/admin/posts/${encodeURIComponent(slug)}`, {
				body: { draft, rev }
			}),
		publishPost: (slug) =>
			call<PostDetailAdmin>('POST', `/admin/posts/${encodeURIComponent(slug)}/publish`),
		unpublishPost: (slug) =>
			call<PostDetailAdmin>('POST', `/admin/posts/${encodeURIComponent(slug)}/unpublish`),
		deletePost: (slug) => call<void>('DELETE', `/admin/posts/${encodeURIComponent(slug)}`),

		// --- photos (§8 + §5 relay) ---
		listPhotos: (o?: PhotoListOpts) =>
			call<Paged<AdminPhoto>>('GET', '/admin/photos', {
				query: q({
					collection: o?.collections,
					gallery: o?.gallery === undefined ? undefined : o.gallery ? '1' : '0',
					from: o?.from,
					to: o?.to,
					sort: o?.sort,
					dir: o?.dir,
					page: o?.page
				})
			}),
		addPhoto: async (p) => {
			// the dataUrl's browser-measured dims are advisory: lumen DECODES the
			// bytes and the response carries truth (the §5 probe is the authority)
			const comma = p.dataUrl.indexOf(',');
			const head = p.dataUrl.slice(0, comma);
			const mime = /image\/(\w+)/.exec(head)?.[0] ?? 'image/png';
			const bytes = Uint8Array.from(atob(p.dataUrl.slice(comma + 1)), (c) => c.charCodeAt(0));
			const form = new FormData();
			const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'img';
			form.append(
				'photo',
				new Blob([bytes], { type: mime }),
				/\.(png|jpe?g|gif|webp)$/i.test(p.name) ? p.name : `${p.name}.${ext}`
			);
			const url = new URL(base + '/admin/photos');
			let res: Response;
			try {
				res = await fetch(url, {
					method: 'POST',
					headers: { Authorization: `Bearer ${bearer}` },
					body: form
				});
			} catch {
				throw new AdminApiError(503, 'lumen unreachable');
			}
			const text = await res.text();
			if (!res.ok) throw new AdminApiError(res.status, safeError(text, `HTTP ${res.status}`));
			return JSON.parse(text) as AdminPhoto;
		},
		updatePhoto: (id, patch: { alt?: string; collection?: string | null; gallery?: boolean }) =>
			call<AdminPhoto>('PATCH', `/admin/photos/${encodeURIComponent(id)}`, {
				// collection: null must ship as JSON null (clears the bucket);
				// undefined fields drop (absent = untouched) — stringify does both
				body: patch
			}),
		getPhoto: (id) => call<AdminPhoto>('GET', `/admin/photos/${encodeURIComponent(id)}`),
		listPhotoReferences: (id) =>
			call<{ slug: string; title: string }[]>(
				'GET',
				`/admin/photos/${encodeURIComponent(id)}/references`
			),
		deletePhoto: (id) => call<void>('DELETE', `/admin/photos/${encodeURIComponent(id)}`),

		// --- vocabulary (§8) ---
		listCollections: () => call<CollectionCount[]>('GET', '/admin/collections'),
		createCollection: (name) =>
			call<CollectionCount>('POST', '/admin/collections', { body: { name } }),
		listTags: () => call<TagCount[]>('GET', '/admin/tags'),
		createTag: (name) => call<TagCount>('POST', '/admin/tags', { body: { name } }),

		// --- palette content door (§8) ---
		search: (needle) => call<SearchResults>('GET', '/admin/search', { query: { q: [needle] } }),

		// --- secrets plane (§9) ---
		listSecretPaths: () => call<SecretPath[]>('GET', '/admin/bao/paths'),
		readSecret: (app, env, version) =>
			call<SecretPayload | null>('GET', `/admin/bao/${enc(app)}/${enc(env)}`, {
				query: version ? { version: [String(version)] } : undefined,
				nullOn404: true
			}),
		secretMeta: (app, env) =>
			call<SecretMeta | null>('GET', `/admin/bao/${enc(app)}/${enc(env)}`, {
				query: { meta: [''] },
				nullOn404: true
			}),
		writeSecret: (app, env, data, cas) =>
			call<{ version: number }>('PUT', `/admin/bao/${enc(app)}/${enc(env)}`, {
				body: { data, cas }
			}).then((r) => r.version),
		onboardApp: (app, envs) =>
			call<{ app: string; envs: string[] }>('POST', '/admin/bao/apps', {
				body: envs?.length ? { app, envs } : { app }
			}),
		addEnv: (app, env) =>
			call<{ app: string; env: string }>('POST', `/admin/bao/${enc(app)}/envs`, { body: { env } }),
		pinSecret: (app, env, version) =>
			call<{ pinnedVersion: number }>('PUT', `/admin/bao/${enc(app)}/${enc(env)}/pin`, {
				body: { version }
			}),
		unpinSecret: (app, env) => call<void>('DELETE', `/admin/bao/${enc(app)}/${enc(env)}/pin`)
	};
}

function enc(s: string): string {
	return encodeURIComponent(s);
}

function safeError(text: string, fallback: string): string {
	try {
		const j = JSON.parse(text) as { error?: string };
		return j.error ?? fallback;
	} catch {
		return fallback;
	}
}
