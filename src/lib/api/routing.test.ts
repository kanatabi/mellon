/**
 * The dual-upstream routing contract (lumen role split, 2026-11-13). No
 * plane, no DOM: the table is asserted per route CLASS, the env resolution
 * per wiring shape, and the fetch-adapter end-to-end against two distinct
 * stub bases — proving control-plane wire paths land on ADMIN_URL and
 * content-plane paths land on CMS_URL, with auth forwarded IDENTICALLY.
 * These are the legs that stand when the dev plane is absent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoutingError, ROUTE_TABLE, baseFor, upstreamFor } from './routing.ts';
import { createLumenApi } from './fetch-adapter.ts';
import { resolveUpstreams, isUpstreamConfigured } from './index.ts';

const PNG_BLOB = new Blob(
	[
		Uint8Array.from(
			atob(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
			),
			(c) => c.charCodeAt(0)
		)
	],
	{ type: 'image/png' }
);

describe('route-class table — control plane (ADMIN_URL)', () => {
	it.each([
		['login', '/admin/session'],
		['verify/whoami', '/admin/session'],
		['password change', '/admin/session/password'],
		['logout', '/admin/session'],
		['users list', '/admin/users'],
		['user create', '/admin/users'],
		['user scopes set', '/admin/users/u/scopes'],
		['scope catalog list', '/admin/scopes'],
		['scope catalog add', '/admin/scopes'],
		['temp password reset', '/admin/users/helper/reset-password'],
		['setup TOFU probe', '/admin/setup'],
		['setup TOFU register', '/admin/setup/register'],
		['matrix sweep', '/admin/bao/summary'],
		['vault paths', '/admin/bao/paths'],
		['vault read', '/admin/bao/lumen/production'],
		['vault write', '/admin/bao/earendil/shared'],
		['pin lock', '/admin/bao/lumen/staging/pin'],
		['app onboarding', '/admin/bao/apps'],
		['env extend', '/admin/bao/mellon/envs'],
		['notifications list', '/admin/notifications'],
		['notifications unread count', '/admin/notifications/unread-count'],
		['notification read', '/admin/notifications/n1/read'],
		['notifications read-all', '/admin/notifications/read-all']
	])('%s routes to admin', (_name, path) => {
		expect(upstreamFor(path)).toBe('admin');
	});
});

describe('route-class table — CMS plane (CMS_URL)', () => {
	it.each([
		['posts list', '/admin/posts'],
		['post detail', '/admin/posts/some-slug'],
		['post publish', '/admin/posts/some-slug/publish'],
		['photos list', '/admin/photos'],
		['photo references', '/admin/photos/p1/references'],
		['tags desk', '/admin/tags'],
		['tag search door', '/admin/tags/search'],
		['tag bulk feature', '/admin/tags/bulk'],
		['collections', '/admin/collections'],
		['media relay', '/admin/media/p1.png'],
		['palette content door', '/admin/search'],
		['public posts passthrough', '/api/posts'],
		['public search passthrough', '/api/search/suggest'],
		['feed passthrough', '/api/feed.xml'],
		['task projects', '/admin/task-projects'],
		['task project members', '/admin/task-projects/p1/members'],
		['task invite revoke', '/admin/task-projects/p1/invites/i1'],
		['task people search', '/admin/task-projects/p1/people'],
		['tasks workspace', '/admin/tasks'],
		['task detail', '/admin/tasks/t1'],
		['task subtasks', '/admin/tasks/t1/subtasks/s1'],
		['task invite inbox', '/admin/task-invites'],
		['task invite accept', '/admin/task-invites/i1/accept'],
		['task stats', '/admin/task-stats']
	])('%s routes to cms', (_name, path) => {
		expect(upstreamFor(path)).toBe('cms');
	});
});

describe('route-class table — discipline', () => {
	it('every table entry classifies its own prefix (self-audit)', () => {
		for (const entry of ROUTE_TABLE) {
			expect(upstreamFor(entry.prefix)).toBe(entry.upstream);
			expect(entry.note).not.toBe('');
		}
	});
	it('matching is SEGMENT-aware, never substring', () => {
		expect(() => upstreamFor('/admin/sessions')).toThrow(RoutingError); // not /admin/session
		expect(() => upstreamFor('/apify')).toThrow(RoutingError); // not /api
		expect(() => upstreamFor('/administrator/posts')).toThrow(RoutingError);
		expect(() => upstreamFor('/admin/tasks-archive')).toThrow(RoutingError); // not /admin/tasks
		expect(() => upstreamFor('/admin/task-project')).toThrow(RoutingError); // not /admin/task-projects
		expect(() => upstreamFor('/admin')).toThrow(RoutingError); // bare prefix is no class
	});
	it('the tasks/notifications prefixes are disjoint (no accidental shadowing)', () => {
		const added = [
			'/admin/task-projects',
			'/admin/tasks',
			'/admin/task-invites',
			'/admin/task-stats',
			'/admin/notifications'
		];
		for (const a of added) {
			for (const b of added) {
				if (a === b) continue;
				expect(b.startsWith(`${a}/`)).toBe(false);
			}
		}
		for (const task of [
			'/admin/task-projects',
			'/admin/tasks',
			'/admin/task-invites',
			'/admin/task-stats'
		]) {
			expect(upstreamFor(task)).toBe('cms');
		}
		expect(upstreamFor('/admin/notifications')).toBe('admin');
	});
	it('unknown paths fail LOUDLY — no default-to-admin', () => {
		let e: unknown = null;
		try {
			upstreamFor('/admin/who-knows-what');
		} catch (err) {
			e = err;
		}
		expect(e).toBeInstanceOf(RoutingError);
		expect((e as Error).message).toContain('routing-table');
		expect((e as Error).message).toContain('/admin/who-knows-what');
	});
	it('baseFor picks the pair member the class names', () => {
		const bases = { admin: 'A', cms: 'C' } as const;
		expect(baseFor('/admin/bao/summary', bases)).toBe('A');
		expect(baseFor('/admin/posts', bases)).toBe('C');
	});
});

describe('resolveUpstreams — the env wiring chain', () => {
	it('nothing set = the dev default on BOTH classes (single-binary dev)', () => {
		const u = resolveUpstreams({});
		expect(u).toEqual({ admin: 'http://localhost:8080', cms: 'http://localhost:8080' });
		expect(isUpstreamConfigured({})).toBe(false);
	});
	it('legacy API_BASE feeds both (pre-split deployments stay honest)', () => {
		const u = resolveUpstreams({ API_BASE: 'http://lumen.test' });
		expect(u).toEqual({ admin: 'http://lumen.test', cms: 'http://lumen.test' });
		expect(isUpstreamConfigured({ API_BASE: 'http://lumen.test' })).toBe(true);
	});
	it('ADMIN_URL + CMS_URL = the split, verbatim', () => {
		const u = resolveUpstreams({
			ADMIN_URL: 'http://lumen-admin.lumen.svc',
			CMS_URL: 'http://lumen-staging.lumen.svc'
		});
		expect(u).toEqual({
			admin: 'http://lumen-admin.lumen.svc',
			cms: 'http://lumen-staging.lumen.svc'
		});
	});
	it('explicit envs win over the legacy one', () => {
		const u = resolveUpstreams({ API_BASE: 'http://old.test', CMS_URL: 'http://cms.test' });
		expect(u.cms).toBe('http://cms.test');
		expect(u.admin).toBe('http://old.test'); // API_BASE still owns the plane it always owned
	});
	it('a lone ADMIN_URL or CMS_URL feeds both — one named binary is a complete lumen', () => {
		expect(resolveUpstreams({ ADMIN_URL: 'http://admin.test' })).toEqual({
			admin: 'http://admin.test',
			cms: 'http://admin.test'
		});
		expect(resolveUpstreams({ CMS_URL: 'http://cms.test' })).toEqual({
			admin: 'http://cms.test',
			cms: 'http://cms.test'
		});
	});
});

describe('fetch-adapter — two stub bases, per route class', () => {
	type Sent = {
		url: string;
		auth?: string;
		method: string;
		contentType?: string;
		timezone?: string;
		body?: string;
	};
	let sent: Sent[] = [];
	function stub() {
		sent = [];
		vi.stubGlobal('fetch', async (input: URL | RequestInfo, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			sent.push({
				url: String(input),
				method: init?.method ?? 'GET',
				auth: headers.get('Authorization') ?? undefined,
				contentType: headers.get('content-type') ?? undefined,
				timezone: headers.get('X-Client-Timezone') ?? undefined,
				body: init?.body === undefined ? undefined : String(init.body)
			});
			// '{}' parses to a truthy object for the adapters that read a
			// field off the result (bulkFeatureTags); routing is what's
			// under test, so the shape only has to survive the pipeline
			return new Response('{}', { status: 200 });
		});
	}
	afterEach(() => vi.unstubAllGlobals());

	const api = () => createLumenApi({ admin: 'http://admin.test', cms: 'http://cms.test' }, 'tok-1');

	it('session + users + setup + bao all land on ADMIN_URL, bearer rides', async () => {
		stub();
		const a = api();
		await a.login('u', 'p');
		await a.whoami();
		await a.profile();
		await a.updateProfile('u', 'u@example.com');
		await a.changePassword('a', 'b');
		await a.logout();
		await a.listUsers();
		await a.createUser('helper', ['content:manage']);
		await a.resetUserPassword('helper');
		await a.setupStatus();
		await a.registerFirstAdmin('owner', 'chosen-password-1');
		await a.listSecretPaths();
		await a.readSecret('lumen', 'shared');
		await a.secretMeta('lumen', 'staging');
		await a.writeSecret('lumen', 'staging', { A: '1' }, 2);
		await a.onboardApp('x');
		await a.addEnv('x', 'lab');
		await a.pinSecret('x', 'dev', 1);
		await a.unpinSecret('x', 'dev');
		await a.estateSummary();
		expect(sent).toHaveLength(20);
		for (const s of sent) expect(s.url.startsWith('http://admin.test/admin/')).toBe(true);
		for (const s of sent) expect(s.auth).toBe('Bearer tok-1');
		expect(sent.map((s) => new URL(s.url).pathname)).toEqual([
			'/admin/session', // login
			'/admin/session', // whoami
			'/admin/profile',
			'/admin/profile',
			'/admin/session/password',
			'/admin/session', // logout
			'/admin/users',
			'/admin/users',
			'/admin/users/helper/reset-password',
			'/admin/setup',
			'/admin/setup/register',
			'/admin/bao/paths',
			'/admin/bao/lumen/shared',
			'/admin/bao/lumen/staging',
			'/admin/bao/lumen/staging',
			'/admin/bao/apps',
			'/admin/bao/x/envs',
			'/admin/bao/x/dev/pin',
			'/admin/bao/x/dev/pin',
			'/admin/bao/summary'
		]);
	});

	it('tasks land on CMS_URL, notifications on ADMIN_URL; the timezone header rides the two day reads', async () => {
		stub();
		const a = api();
		await a.tasksWorkspace({ view: 'today', projectId: 'p1', timezone: 'Asia/Jakarta' });
		await a.taskStats('Asia/Jakarta');
		await a.taskProjectCreate('Home');
		await a.taskGet('t1');
		await a.taskInviteeSearch('p1', '@sarah');
		await a.notificationsUnreadCount();
		expect(sent).toHaveLength(6);
		for (const s of sent.slice(0, 5)) expect(s.url.startsWith('http://cms.test/admin/')).toBe(true);
		expect(sent[5].url.startsWith('http://admin.test/admin/')).toBe(true);
		for (const s of sent) expect(s.auth).toBe('Bearer tok-1');
		expect(sent.map((s) => new URL(s.url).pathname)).toEqual([
			'/admin/tasks',
			'/admin/task-stats',
			'/admin/task-projects',
			'/admin/tasks/t1',
			'/admin/task-projects/p1/people',
			'/admin/notifications/unread-count'
		]);
		expect(sent[4].url).toBe('http://cms.test/admin/task-projects/p1/people?q=%40sarah');
		expect(sent[0].url).toBe('http://cms.test/admin/tasks?view=today&project=p1');
		expect(sent[0].timezone).toBe('Asia/Jakarta');
		expect(sent[1].timezone).toBe('Asia/Jakarta');
		expect(sent[2].timezone).toBeUndefined(); // only the day reads carry it
	});

	it('the task PATCH body is explicit: null ships, an absent field drops', async () => {
		stub();
		const a = api();
		await a.taskUpdate('t1', { dueAt: null, assignedTo: null });
		await a.taskUpdate('t1', { title: 'Fix the gate' });
		expect(JSON.parse(sent[0].body ?? 'null')).toEqual({ dueAt: null, assignedTo: null });
		expect(JSON.parse(sent[1].body ?? 'null')).toEqual({ title: 'Fix the gate' });
		expect(sent[0].method).toBe('PATCH');
		expect(sent[0].url).toBe('http://cms.test/admin/tasks/t1');
	});

	it('posts + photos + tags + collections + search all land on CMS_URL, bearer rides', async () => {
		stub();
		const a = api();
		await a.listPosts({ status: 'draft' });
		await a.getPost('slug');
		await a.createPost({ slug: 's' } as never);
		await a.updatePost('s', { slug: 's' } as never, 1);
		await a.publishPost('s');
		await a.unpublishPost('s');
		await a.deletePost('s');
		await a.listPhotos();
		await a.addPhoto({ name: 'p', file: PNG_BLOB });
		await a.updatePhoto('p1', { alt: 'x' });
		await a.getPhoto('p1');
		await a.listPhotoReferences('p1');
		await a.deletePhoto('p1');
		await a.listCollections();
		await a.createCollection('street');
		await a.listTags();
		await a.listNewestTags();
		await a.searchTags('clo', 1, 30);
		await a.bulkFeatureTags(['a'], true);
		await a.createTag('new');
		await a.updateTag('new', { featured: true });
		await a.deleteTag('new');
		await a.search('needle');
		expect(sent).toHaveLength(23);
		for (const s of sent) expect(s.url.startsWith('http://cms.test/admin/')).toBe(true);
		// auth forwarding is IDENTICAL across upstreams — the same bearer
		// header the single-upstream relay ships today, both planes, no drift
		for (const s of sent) expect(s.auth).toBe('Bearer tok-1');
		// the multipart upload verb ships the right path too
		expect(sent.some((s) => s.method === 'POST' && s.url === 'http://cms.test/admin/photos')).toBe(
			true
		);
	});

	it('the stream shape forwards verbatim: the given content-type to the CMS URL, bearer rides', async () => {
		stub();
		const body = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(new Uint8Array([1, 2, 3]));
				c.close();
			}
		});
		await api().addPhoto({
			body,
			contentType: 'multipart/form-data; boundary=kit-boundary',
			contentLength: 3
		});
		expect(sent).toHaveLength(1);
		const s = sent[0];
		expect(s.url).toBe('http://cms.test/admin/photos'); // the CMS plane decides, as for {file}
		expect(s.method).toBe('POST');
		expect(s.auth).toBe('Bearer tok-1'); // auth forwarding identical, both shapes
		// the relay's content-type SHIPS UNTOUCHED — the multipart boundary
		// the browser stamped must reach lumen intact
		expect(s.contentType).toBe('multipart/form-data; boundary=kit-boundary');
	});

	it('a single string target = single binary: both classes ride the one base', async () => {
		stub();
		const a = createLumenApi('http://one.test', 'tok-2');
		await a.whoami(); // admin class
		await a.listPosts(); // cms class
		expect(sent.map((s) => s.url)).toEqual([
			'http://one.test/admin/session',
			'http://one.test/admin/posts'
		]);
	});

	it('trailing slashes in the bases never double up on the wire', async () => {
		stub();
		const a = createLumenApi({ admin: 'http://admin.test/', cms: 'http://cms.test//' }, 'tok-3');
		await a.estateSummary();
		await a.listPosts();
		expect(sent.map((s) => s.url)).toEqual([
			'http://admin.test/admin/bao/summary',
			'http://cms.test/admin/posts'
		]);
	});
});
