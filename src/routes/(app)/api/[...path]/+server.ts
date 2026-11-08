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
	const api = createApi();
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
			return json(
				await api.listPosts({
					status: status === 'draft' || status === 'published' ? status : undefined,
					q: url.searchParams.get('q') ?? undefined
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
		if (request.method === 'GET') return json(await api.listPhotos());
		if (request.method === 'POST') return json(await api.addPhoto(await body()), { status: 201 });
	}

	// --- tags ---
	if (seg === 'tags' && request.method === 'GET') return json(await api.listTags());

	// --- secrets (lumen §9 passthrough shape) ---
	if (p[0] === 'secrets') {
		if (p.length === 1 && request.method === 'GET') return json(await api.listSecretPaths());
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
export const DELETE = guarded satisfies RequestHandler;
