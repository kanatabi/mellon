import { json } from '@sveltejs/kit';
import { createApi, AdminApiError } from '#lib/api/index.ts';
import { renderMarkdown } from '#lib/preview/render.ts';
import { isAuthed, SESSION_COOKIE } from '#lib/session.ts';
import type { RequestHandler } from './$types';

/**
 * mellon's local API surface (`/api/*`, auth-guarded). The browser NEVER talks
 * to lumen (DESIGN §4): today this handler resolves against the mock; in Phase
 * B it becomes the dumb same-origin relay that forwards to `API_BASE` —
 * "the relay forwards; it never decides" starts honest HERE: every route below
 * maps 1:1 to an AdminApi method, no logic of its own.
 */

const http = (e: unknown): number =>
	e instanceof AdminApiError
		? e.status
		: e instanceof Error && e.message === 'not found'
			? 404
			: 500;

type Ctx = {
	request: Request;
	params: { path: string };
	cookies: import('@sveltejs/kit').Cookies;
	url: URL;
};

async function route(ctx: Ctx) {
	const { params, url, request } = ctx;
	const p = params.path.split('/').filter(Boolean);
	const api = createApi(ctx.cookies.get(SESSION_COOKIE) ?? '');
	const body = () => request.json();
	const seg = p.join('/');

	// preview: pure local render helper (not lumen's surface — deviating
	// endpoint, journaled). Lives here to reuse the auth guard.
	if (seg === 'preview' && request.method === 'POST') {
		const { md } = (await body()) as { md: string };
		return json(await renderMarkdown(String(md ?? '')));
	}

	// --- posts ---
	if (p[0] === 'posts') {
		if (p.length === 1 && request.method === 'GET') {
			const status = url.searchParams.get('status');
			const sort = url.searchParams.get('sort');
			const dir = url.searchParams.get('dir');
			const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
			const from = url.searchParams.get('from');
			const to = url.searchParams.get('to');
			return json(
				await api.listPosts({
					status:
						status === 'draft' || status === 'published' || status === 'unpublished'
							? status
							: undefined,
					tag: url.searchParams.getAll('tag'),
					page: Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1,
					from: from && DATE_RE.test(from) ? from : undefined,
					to: to && DATE_RE.test(to) ? to : undefined,
					sort:
						sort === 'created' || sort === 'published' || sort === 'title' || sort === 'updated'
							? sort
							: 'updated',
					dir: dir === 'asc' ? 'asc' : 'desc'
				})
			);
		}
		if (p.length === 1 && request.method === 'POST')
			return json(await api.createPost(await body()), { status: 201 });
		if (p.length === 2 && request.method === 'GET') return json(await api.getPost(p[1]));
		if (p.length === 2 && request.method === 'PUT') {
			const { draft, rev } = (await body()) as { draft: never; rev: number };
			return json(await api.updatePost(p[1], draft, rev));
		}
		if (p.length === 3 && p[2] === 'publish' && request.method === 'POST')
			return json(await api.publishPost(p[1]));
		if (p.length === 3 && p[2] === 'unpublish' && request.method === 'POST')
			return json(await api.unpublishPost(p[1]));
		if (p.length === 2 && request.method === 'DELETE') {
			await api.deletePost(p[1]);
			return json({ ok: true });
		}
	}

	// --- photos ---
	if (p[0] === 'photos' && p.length === 1) {
		if (request.method === 'GET') {
			const col = url.searchParams.getAll('collection');
			const gal = url.searchParams.get('gallery');
			const sort = url.searchParams.get('sort');
			const dir = url.searchParams.get('dir');
			const from = url.searchParams.get('from');
			const to = url.searchParams.get('to');
			const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
			return json(
				await api.listPhotos({
					collections: col.length ? col : undefined,
					gallery: gal === '1' ? true : gal === '0' ? false : undefined,
					from: from && DATE_RE.test(from) ? from : undefined,
					to: to && DATE_RE.test(to) ? to : undefined,
					sort: sort === 'title' || sort === 'collection' || sort === 'created' ? sort : undefined,
					dir: dir === 'asc' || dir === 'desc' ? dir : undefined,
					page: Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
				})
			);
		}
		if (request.method === 'POST') return json(await api.addPhoto(await body()), { status: 201 });
	}
	if (p[0] === 'photos' && p.length === 2 && request.method === 'PATCH') {
		return json(await api.updatePhoto(p[1], await body()));
	}
	if (p[0] === 'photos' && p.length === 2 && request.method === 'GET') {
		return json(await api.getPhoto(p[1]));
	}
	if (p[0] === 'photos' && p.length === 3 && p[2] === 'references' && request.method === 'GET') {
		return json(await api.listPhotoReferences(p[1]));
	}
	if (p[0] === 'photos' && p.length === 2 && request.method === 'DELETE') {
		await api.deletePhoto(p[1]);
		return json({ ok: true });
	}

	// --- collections (curation vocabulary, admin-internal) ---
	if (p[0] === 'collections' && p.length === 1) {
		if (request.method === 'GET') return json(await api.listCollections());
		if (request.method === 'POST') {
			const { name } = (await body()) as { name: string };
			return json(await api.createCollection(String(name ?? '')), { status: 201 });
		}
	}

	// --- tags (the desk's 1:1 relay: GET/POST/PATCH/DELETE + static bulk/search) ---
	if (seg === 'tags' && request.method === 'GET') {
		// `?order=newest` routes to its own 1:1 method — a mapping, not a decision
		return json(
			url.searchParams.get('order') === 'newest' ? await api.listNewestTags() : await api.listTags()
		);
	}
	if (seg === 'tags' && request.method === 'POST') {
		const { name } = (await body()) as { name: string };
		return json(await api.createTag(String(name ?? '')), { status: 201 });
	}
	// bulk/search are STATIC segments — matched before the {name} routes below
	// (lumen's own router precedence, mirrored here)
	if (p[0] === 'tags' && p.length === 2 && p[1] === 'search' && request.method === 'GET') {
		return json(
			await api.searchTags(
				url.searchParams.get('q') ?? '',
				Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1,
				Number.parseInt(url.searchParams.get('pageSize') ?? '30', 10) || 30
			)
		);
	}
	if (p[0] === 'tags' && p.length === 2 && p[1] === 'bulk' && request.method === 'PATCH') {
		const { names, featured } = (await body()) as { names: string[]; featured: boolean };
		return json({
			updated: await api.bulkFeatureTags(
				Array.isArray(names) ? names.map(String) : [],
				Boolean(featured)
			)
		});
	}
	if (p[0] === 'tags' && p.length === 2 && request.method === 'PATCH') {
		const patch = (await body()) as { name?: string; featured?: boolean };
		return json(
			await api.updateTag(p[1], {
				...(patch.name !== undefined ? { name: String(patch.name) } : {}),
				...(patch.featured !== undefined ? { featured: Boolean(patch.featured) } : {})
			})
		);
	}
	if (p[0] === 'tags' && p.length === 2 && request.method === 'DELETE') {
		await api.deleteTag(p[1]);
		return json({ ok: true });
	}

	// --- search (palette content door) ---
	if (seg === 'search' && request.method === 'GET') {
		return json(await api.search(url.searchParams.get('q') ?? ''));
	}

	// --- secrets (lumen §9 passthrough shape; control plane per PLAN §2.1) ---
	if (p[0] === 'secrets') {
		if (p.length === 1 && request.method === 'GET') return json(await api.listSecretPaths());
		if (p.length === 2 && p[1] === 'apps' && request.method === 'POST') {
			const { app, envs } = (await body()) as { app: string; envs?: string[] };
			return json(
				await api.onboardApp(String(app ?? ''), Array.isArray(envs) ? envs.map(String) : undefined)
			);
		}
		if (p.length === 3 && p[2] === 'envs' && request.method === 'POST') {
			const { env } = (await body()) as { env: string };
			return json(await api.addEnv(p[1], String(env ?? '')));
		}
		if (p.length === 4 && p[3] === 'pin' && request.method === 'PUT') {
			const { version } = (await body()) as { version: number };
			return json(await api.pinSecret(p[1], p[2], Number(version)));
		}
		if (p.length === 4 && p[3] === 'pin' && request.method === 'DELETE') {
			await api.unpinSecret(p[1], p[2]);
			return json({ ok: true });
		}
		if (p.length === 3) {
			const [app, env] = [p[1], p[2]];
			if (request.method === 'GET') {
				if (url.searchParams.get('meta') !== null) return json(await api.secretMeta(app, env));
				const v = url.searchParams.get('version');
				return json(await api.readSecret(app, env, v ? Number(v) : undefined));
			}
			if (request.method === 'PUT') {
				const { data, cas } = (await body()) as { data: Record<string, string>; cas: number };
				return json({ version: await api.writeSecret(app, env, data, cas) });
			}
		}
	}

	return json({ error: 'no such route' }, { status: 404 });
}

async function guarded(ctx: Ctx) {
	if (!isAuthed(ctx.cookies.get(SESSION_COOKIE))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	try {
		return await route(ctx);
	} catch (e) {
		const status = http(e);
		return json({ error: e instanceof Error ? e.message : 'internal' }, { status });
	}
}

export const GET = guarded satisfies RequestHandler;
export const POST = guarded satisfies RequestHandler;
export const PUT = guarded satisfies RequestHandler;
export const PATCH = guarded satisfies RequestHandler;
export const DELETE = guarded satisfies RequestHandler;
