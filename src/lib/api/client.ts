/**
 * Browser-side AdminApi client — same interface as the server layer, calling
 * mellon's `/api/*` surface. The UI imports ONLY this; whether the handler
 * behind it resolves from mock (today) or relays to lumen (Phase B) is
 * invisible up the stack — the whole point of the relay doctrine.
 */
import type {
	AdminApi,
	AdminPhoto,
	CollectionCount,
	Paged,
	PostDetailAdmin,
	PostStatus,
	PostSummaryAdmin,
	SecretMeta,
	SecretPath,
	SecretPayload,
	TagCount,
	SearchResults
} from './types.ts';

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`/api${path}`, {
		...init,
		headers: init?.body ? { 'content-type': 'application/json' } : undefined
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		throw new ApiError(res.status, body.error ?? `request failed (${res.status})`);
	}
	return res.json() as Promise<T>;
}

export const client: AdminApi = {
	login: () => {
		// Session minting is the /login form action (server-side cookie). Present
		// only to satisfy the interface; never callable meaningfully here.
		throw new ApiError(500, 'login is served by the form action, not the browser client');
	},
	logout: () => {
		// symmetric with login: end-session is the /logout server action — the
		// browser never learns the token, and never revokes with it either
		throw new ApiError(500, 'logout is served by the /logout action, not the browser client');
	},

	listPosts: (opts) => {
		const params = new URLSearchParams();
		if (opts?.status) params.set('status', opts.status);
		for (const t of opts?.tag ?? []) params.append('tag', t);
		if (opts?.from) params.set('from', opts.from);
		if (opts?.to) params.set('to', opts.to);
		if (opts?.sort) params.set('sort', opts.sort);
		if (opts?.dir) params.set('dir', opts.dir);
		if (opts?.page) params.set('page', String(opts.page));
		const qs = params.toString();
		return call<Paged<PostSummaryAdmin>>(`/posts${qs ? `?${qs}` : ''}`);
	},
	getPost: (slug) => call<PostDetailAdmin>(`/posts/${slug}`),
	createPost: (draft) =>
		call<PostDetailAdmin>('/posts', { method: 'POST', body: JSON.stringify(draft) }),
	updatePost: (slug, draft, rev) =>
		call<PostDetailAdmin>(`/posts/${slug}`, {
			method: 'PUT',
			body: JSON.stringify({ draft, rev })
		}),
	publishPost: (slug) => call<PostDetailAdmin>(`/posts/${slug}/publish`, { method: 'POST' }),
	unpublishPost: (slug) => call<PostDetailAdmin>(`/posts/${slug}/unpublish`, { method: 'POST' }),
	deletePost: (slug) =>
		call<{ ok: true }>(`/posts/${slug}`, { method: 'DELETE' }).then(() => undefined),

	listPhotos: (opts) => {
		const params = new URLSearchParams();
		for (const c of opts?.collections ?? []) params.append('collection', c);
		if (opts?.gallery !== undefined) params.set('gallery', opts.gallery ? '1' : '0');
		if (opts?.from) params.set('from', opts.from);
		if (opts?.to) params.set('to', opts.to);
		if (opts?.sort) params.set('sort', opts.sort);
		if (opts?.dir) params.set('dir', opts.dir);
		if (opts?.page) params.set('page', String(opts.page));
		const qs = params.toString();
		return call<Paged<AdminPhoto>>(`/photos${qs ? `?${qs}` : ''}`);
	},
	addPhoto: (p) => call<AdminPhoto>('/photos', { method: 'POST', body: JSON.stringify(p) }),
	updatePhoto: (id, patch) =>
		call<AdminPhoto>(`/photos/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
	getPhoto: (id) => call<AdminPhoto>(`/photos/${id}`),
	listPhotoReferences: (id) => call<{ slug: string; title: string }[]>(`/photos/${id}/references`),
	deletePhoto: (id) =>
		call<{ ok: true }>(`/photos/${id}`, { method: 'DELETE' }).then(() => undefined),

	listCollections: () => call<CollectionCount[]>('/collections'),
	createCollection: (name) =>
		call<CollectionCount>('/collections', { method: 'POST', body: JSON.stringify({ name }) }),

	listTags: () => call<TagCount[]>('/tags'),
	search: (q) => call<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
	createTag: (name) => call<TagCount>('/tags', { method: 'POST', body: JSON.stringify({ name }) }),
	updateTag: (name, patch) =>
		call<TagCount>(`/tags/${name}`, { method: 'PATCH', body: JSON.stringify(patch) }),
	deleteTag: (name) => call(`/tags/${name}`, { method: 'DELETE' }),

	listSecretPaths: () => call<SecretPath[]>('/secrets'),
	readSecret: (app, env, version) =>
		call<SecretPayload | null>(`/secrets/${app}/${env}${version ? `?version=${version}` : ''}`),
	secretMeta: (app, env) => call<SecretMeta | null>(`/secrets/${app}/${env}?meta`),
	writeSecret: (app, env, data, cas) =>
		call<{ version: number }>(`/secrets/${app}/${env}`, {
			method: 'PUT',
			body: JSON.stringify({ data, cas })
		}).then((r) => r.version),
	onboardApp: (app, envs) =>
		call<{ app: string; envs: string[] }>('/secrets/apps', {
			method: 'POST',
			body: JSON.stringify(envs?.length ? { app, envs } : { app })
		}),
	addEnv: (app, env) =>
		call<{ app: string; env: string }>(`/secrets/${app}/envs`, {
			method: 'POST',
			body: JSON.stringify({ env })
		}),
	pinSecret: (app, env, version) =>
		call<{ pinnedVersion: number }>(`/secrets/${app}/${env}/pin`, {
			method: 'PUT',
			body: JSON.stringify({ version })
		}),
	unpinSecret: (app, env) => call(`/secrets/${app}/${env}/pin`, { method: 'DELETE' })
};

export async function preview(
	md: string
): Promise<{ html: string; toc: { id: string; text: string; depth: 2 | 3 }[] }> {
	return call('/preview', { method: 'POST', body: JSON.stringify({ md }) });
}

export type { PostStatus };
