import { describe, expect, it } from 'vitest';
import { AdminApiError, POSTS_PAGE_SIZE, type PostDraft } from './types.ts';
import { createMockApi, mediaStore } from './mock.ts';
import { orderEnvs } from '../secrets-diff.ts';

/**
 * Contract tests for the mock AdminApi — the Phase A source of truth that the
 * lumen §8/§9 implementation must match when the fetch adapter lands. Each
 * test names the lumen behavior it pins.
 */

const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
	slug: 'contract-test',
	title: 'Contract test',
	subtitle: '',
	preview: '',
	date: '2026-11-08',
	tags: ['qa'],
	content: '# Contract test\n\nbody;',
	thumbnail: null,
	...over
});

describe('mock AdminApi contract', () => {
	it('seeds the corpus: 3 posts (published, draft, unpublished), mermaid fence intact', async () => {
		const api = createMockApi();
		const posts = await api.listPosts();
		expect(posts.total).toBe(3);
		expect(posts.items).toHaveLength(3);
		expect(posts.items.filter((p) => p.status === 'published')).toHaveLength(1);
		expect(posts.items.filter((p) => p.status === 'unpublished')).toHaveLength(1);
		const pub = await api.getPost('shape-of-a-useful-queue');
		expect(pub.content).toContain('```mermaid'); // Route B: raw fences stored
		expect(pub.createdAt).toBe('2024-04-28T15:03:00Z');
		expect(pub.publishedAt).toBe('2024-05-14T09:12:00Z');
		const never = await api.getPost('queues-unacked');
		expect(never.publishedAt).toBeNull();
		await expect(api.getPost('nope')).rejects.toMatchObject({ status: 404 });
	});

	it('§4 state machine: draft→published→unpublished→published, never back to draft', async () => {
		const api = createMockApi();
		const pub = await api.publishPost('queues-unacked'); // draft → published
		expect(pub.status).toBe('published');
		expect(pub.publishedAt).toBeTruthy();
		const off = await api.unpublishPost('queues-unacked'); // published → unpublished
		expect(off.status).toBe('unpublished');
		const back = await api.publishPost('queues-unacked'); // unpublished → published
		expect(back.status).toBe('published');
		// no verb returns a shipped post to draft
		await expect(api.unpublishPost('shape-of-a-useful-queue')).resolves.toMatchObject({
			status: 'unpublished'
		});
		await expect(api.unpublishPost('latency-as-product-decision')).rejects.toMatchObject({
			status: 409 // seeded unpublished — only live posts come down
		});
	});

	it('list filters relay server-side: status, tag OR, sort field/dir, date window', async () => {
		const api = createMockApi();
		const drafts = await api.listPosts({ status: 'draft' });
		expect(drafts.items.map((p) => p.slug)).toEqual(['queues-unacked']);
		const orTags = await api.listPosts({ tag: ['latency', 'backpressure'] });
		expect(orTags.items.map((p) => p.slug).sort()).toEqual([
			'latency-as-product-decision',
			'shape-of-a-useful-queue'
		]);
		// default: updated, desc
		const newest = await api.listPosts({});
		const oldest = await api.listPosts({ sort: 'updated', dir: 'asc' });
		expect(oldest.items[0].slug).toBe(newest.items[newest.items.length - 1].slug);
		// queues-unacked was touched "now" — it heads newest, tails oldest
		expect(newest.items[0].slug).toBe('queues-unacked');
		expect(oldest.items[oldest.items.length - 1].slug).toBe('queues-unacked');
		// created asc: latency (Jan 2024) precedes shape (Apr 2024)
		const byCreated = await api.listPosts({ sort: 'created', dir: 'asc' });
		expect(byCreated.items[0].slug).toBe('latency-as-product-decision');
		// published desc: never-published sinks to the tail (empty key)
		const byPublished = await api.listPosts({ sort: 'published', dir: 'desc' });
		expect(byPublished.items[byPublished.items.length - 1].slug).toBe('queues-unacked');
		// title A→Z
		const byTitle = await api.listPosts({ sort: 'title', dir: 'asc' });
		expect(byTitle.items.map((p) => p.title)).toEqual([
			'Queues, unacked',
			'The shape of a useful queue',
			'When latency becomes a product decision'
		]);
		// inclusive editorial-date window
		const windowed = await api.listPosts({ from: '2024-03-01', to: '2024-06-30' });
		expect(windowed.items.map((p) => p.slug)).toEqual(['shape-of-a-useful-queue']);
	});

	it('pagination: { total, items, page, pageSize } envelope, pages clamp', async () => {
		const api = createMockApi();
		const first = await api.listPosts({ page: 1 });
		expect(first.pageSize).toBe(POSTS_PAGE_SIZE);
		expect(first.page).toBe(1);
		expect(first.total).toBe(3);
		expect(first.items).toHaveLength(3); // seed corpus fits on one page
		// out-of-range clamps to the last page — never an empty void
		const far = await api.listPosts({ page: 99 });
		expect(far.page).toBe(1);
		expect(far.items).toHaveLength(3);
		// a corpus that spills: 45 creates → 48 total → 3 pages
		for (let i = 0; i < 45; i++)
			await api.createPost(draft({ slug: `bulk-${i}`, title: `Bulk ${i}` }));
		const p2 = await api.listPosts({ page: 2 });
		expect(p2.total).toBe(48);
		expect(p2.page).toBe(2);
		expect(p2.items).toHaveLength(POSTS_PAGE_SIZE);
		const p3 = await api.listPosts({ page: 3 });
		expect(p3.items.length).toBe(8);
		const ids = new Set([...p2.items.map((p) => p.slug), ...p3.items.map((p) => p.slug)]);
		expect(ids.size).toBe(p2.items.length + p3.items.length); // pages don't overlap
	});

	it('update is CAS-checked on rev (lumen §8 optimistic lock)', async () => {
		const api = createMockApi();
		const before = await api.getPost('queues-unacked');
		await expect(
			api.updatePost('queues-unacked', draft({ slug: 'queues-unacked' }), 99)
		).rejects.toMatchObject({ status: 409 });
		const after = await api.updatePost(
			'queues-unacked',
			draft({ slug: 'queues-unacked' }),
			before.rev
		);
		expect(after.rev).toBe(before.rev + 1);
	});

	it('publish defaults an empty preview to the first paragraph (§2 unit of work)', async () => {
		const api = createMockApi();
		const p = await api.publishPost('queues-unacked');
		expect(p.status).toBe('published');
		expect(p.preview.length).toBeGreaterThan(0);
		expect(p.preview).not.toContain('# ');
	});

	it('create rejects a duplicate slug (409), starts at rev 1', async () => {
		const api = createMockApi();
		await expect(api.createPost(draft({ slug: 'queues-unacked' }))).rejects.toMatchObject({
			status: 409
		});
		const created = await api.createPost(draft());
		expect(created.rev).toBe(1);
		expect(created.status).toBe('draft');
	});

	it('secret writes are CAS-checked and version-append (Bao KV-v2 semantics)', async () => {
		const api = createMockApi();
		const v = await api.secretMeta('lumen', 'staging');
		expect(v?.currentVersion).toBe(2);
		await expect(api.writeSecret('lumen', 'staging', { A: '1' }, 1)).rejects.toMatchObject({
			status: 409
		});
		const next = await api.writeSecret('lumen', 'staging', { A: '1' }, 2);
		expect(next).toBe(3);
		const read = await api.readSecret('lumen', 'staging', 2); // old version stays readable
		expect(read?.data.MEILI_URL).toContain('meilisearch');
		const gone = await api.readSecret('ghost', 'prod');
		expect(gone).toBeNull();
	});

	it('secrets control plane (twin baseline for lumen): onboard trio, mirror fan-out, pin write-lock', async () => {
		const api = createMockApi();
		// CAS always read from meta, never remembered: structural writes
		// mirror to siblings and bump THEM — the same trap that the lumen
		// integration leg hit, proven honest by the same discipline.
		const write = async (env: string, data: Record<string, string>) => {
			const cv = (await api.secretMeta('twinapp', env))?.currentVersion ?? 0;
			return api.writeSecret('twinapp', env, data, cv);
		};
		// onboard: the trio arrives (D4), duplicates refuse (never overwrite)
		const ob = await api.onboardApp('twinapp');
		expect(ob.envs).toEqual(['dev', 'staging', 'production']);
		await expect(api.onboardApp('twinapp')).rejects.toMatchObject({ status: 409 });
		await expect(api.onboardApp('Twin_App')).rejects.toMatchObject({ status: 400 });
		// structural write in staging mirrors DB_URL into dev AND production
		await write('staging', { DB_URL: 'sibling-keeps-me' });
		expect((await api.readSecret('twinapp', 'dev'))?.data).toEqual({ DB_URL: '' });
		// dev gains a second key: both siblings mirror the ADD (empty value)
		expect(await write('dev', { DB_URL: 'd', NEW: 'n' })).toBe(3);
		const sib = await api.readSecret('twinapp', 'staging');
		expect(sib?.data).toEqual({ DB_URL: 'sibling-keeps-me', NEW: '' });
		expect(sib?.version).toBe(3);
		expect((await api.readSecret('twinapp', 'production'))?.data).toEqual({ DB_URL: '', NEW: '' });
		// value-only save: no sibling bumps
		expect(await write('dev', { DB_URL: 'd2', NEW: 'n' })).toBe(4);
		expect((await api.secretMeta('twinapp', 'staging'))?.currentVersion).toBe(3);
		// removal propagates everywhere
		expect(await write('dev', { DB_URL: 'd2' })).toBe(5);
		expect((await api.readSecret('twinapp', 'production'))?.data).toEqual({ DB_URL: '' });
		expect((await api.readSecret('twinapp', 'staging'))?.data).toEqual({
			DB_URL: 'sibling-keeps-me'
		});
		// add-env seeds the canonical union of live siblings
		expect(await api.addEnv('twinapp', 'lab')).toEqual({ app: 'twinapp', env: 'lab' });
		expect((await api.readSecret('twinapp', 'lab'))?.data).toEqual({ DB_URL: '' });
		await expect(api.addEnv('twinapp', 'lab')).rejects.toMatchObject({ status: 409 });
		await expect(api.addEnv('ghostapp', 'dev')).rejects.toMatchObject({ status: 404 });
		// pin = LOCK (D1 redefined, lumen 230783b): recorded, surfaced — and
		// it freezes WRITES while reads keep serving head.
		await api.pinSecret('twinapp', 'dev', 2);
		expect((await api.secretMeta('twinapp', 'dev'))?.pinnedVersion).toBe(2);
		expect((await api.readSecret('twinapp', 'dev'))?.version).toBe(5); // head still wins
		await expect(api.pinSecret('twinapp', 'dev', 99)).rejects.toMatchObject({ status: 404 });
		// the lock's teeth: a CAS write through the pin REFUSES with the
		// wire copy EXACT (lumen asserts it at byte level; mellon renders it
		// verbatim — no ApiError-prefix drift allowed).
		const refused = (await api
			.writeSecret('twinapp', 'dev', { DB_URL: 'through-the-lock' }, 5)
			.catch((e) => e)) as AdminApiError;
		expect(refused).toBeInstanceOf(AdminApiError);
		expect(refused.status).toBe(403);
		expect(refused.message).toBe('pinned at v2 — unpin first');
		// a refused save writes NOTHING: no bump, no mirror — head still v5
		expect((await api.secretMeta('twinapp', 'dev'))?.currentVersion).toBe(5);
		expect((await api.readSecret('twinapp', 'dev'))?.data).toEqual({ DB_URL: 'd2' });
		// unpin releases: the SAME save lands (the lock's own remedy walk)
		await api.unpinSecret('twinapp', 'dev');
		expect((await api.secretMeta('twinapp', 'dev'))?.pinnedVersion).toBeNull();
		expect(await api.writeSecret('twinapp', 'dev', { DB_URL: 'through-the-lock' }, 5)).toBe(6);
	});

	it('estate matrix (twin): counts, empties, pins — arithmetic over truth', async () => {
		const api = createMockApi();
		const app = 'twin-sum-' + Date.now().toString(36).slice(-4);
		await api.onboardApp(app);
		await api.writeSecret(app, 'dev', { EMPTY_A: '', FILLED_B: 'v' }, 1);
		await api.pinSecret(app, 'dev', 1);
		const rows = (await api.estateSummary()).filter((r) => r.app === app);
		const dev = rows.find((r) => r.env === 'dev');
		const staging = rows.find((r) => r.env === 'staging');
		expect(dev?.keys).toBe(2);
		expect(dev?.emptyKeys).toBe(1);
		expect(dev?.pinnedVersion).toBe(1);
		expect(dev?.version).toBe(2);
		// the mirror fanned the shape sideways — empties everywhere (C1 signal)
		expect(staging?.keys).toBe(2);
		expect(staging?.emptyKeys).toBe(2);
		expect(staging?.pinnedVersion).toBeNull();
	});

	it('unified-vault twin (role-split round): shared + staging + production coexist, ranked shared-first', async () => {
		const api = createMockApi();
		// the seeded estate carries lumen's THREE plane rows side by side —
		// driftcheck feeds the matrix the lumen/shared path like any other
		const paths = await api.listSecretPaths();
		for (const env of ['shared', 'staging', 'production'])
			expect(paths).toContainEqual({ app: 'lumen', env });
		const lumenEnvs = paths
			.filter((p) => p.app === 'lumen')
			.map((p) => p.env)
			.sort();
		expect(lumenEnvs).toEqual(['production', 'shared', 'staging']);
		// and the RANKED column puts shared first, staging before production
		expect(orderEnvs(lumenEnvs)).toEqual(['shared', 'staging', 'production']);
		// shared = cluster-wide values; production = its own truth, per env
		expect((await api.readSecret('lumen', 'shared'))?.data.DB_HOST).toContain('lumen-pg');
		expect((await api.readSecret('lumen', 'production'))?.data.DB_USER).toBe('lumen_production');
		expect((await api.readSecret('lumen', 'staging'))?.data.DB_USER).toBe('lumen_staging');
		// mellon's own wiring is vault data too: ADMIN_URL shared estate-wide,
		// CMS_URL per env — the same image, two portals (docs sibling:
		// seed these exact kv keys)
		expect((await api.readSecret('mellon', 'shared'))?.data.ADMIN_URL).toContain('lumen-admin');
		expect((await api.readSecret('mellon', 'staging'))?.data.CMS_URL).toContain('lumen-staging');
		expect((await api.readSecret('mellon', 'production'))?.data.CMS_URL).toContain(
			'lumen-http-server'
		);
		// the matrix sweep serves all of it, arithmetic intact
		const rows = await api.estateSummary();
		const cell = (app: string, env: string) => rows.find((r) => r.app === app && r.env === env);
		expect(cell('lumen', 'shared')?.keys).toBe(2); // trails staging — ↓ by truth
		expect(cell('lumen', 'production')?.keys).toBe(4);
		expect(cell('mellon', 'staging')?.keys).toBe(1);
	});

	it('setup wizard (twin): TOFU-once, flags, one-time temps — mirror of lumen e2e', async () => {
		const api = createMockApi();
		expect((await api.setupStatus()).unclaimed).toBe(true);
		const reg = await api.registerFirstAdmin('owner', 'chosen-password-1');
		expect(reg.scopes).toEqual([
			'content:manage',
			'secrets:admin',
			'users:manage',
			'settings:manage'
		]); // the TOFU grant IS the full catalog
		expect(reg.mustChange).toBe(false);
		expect((await api.setupStatus()).unclaimed).toBe(false);
		await expect(api.registerFirstAdmin('squatter', 'not-happening-1')).rejects.toMatchObject({
			status: 410
		});
		await expect(api.registerFirstAdmin('A BAD NAME', 'x'.repeat(11))).rejects.toMatchObject({
			status: 400
		});
		const created = await api.createUser('helper', ['content:manage']);
		expect(created.scopes).toEqual(['content:manage']);
		expect(created.tempPassword).toMatch(/^(?:[a-z]{4}-){4}[0-9]{4}$/);
		const login = await api.login('helper', created.tempPassword);
		expect(login.mustChange).toBe(true); // lumen answers the same; 428 gates the rest
		const rows = await api.listUsers();
		expect(rows.map((r) => r.username)).toEqual(['owner', 'helper']);
		const reset = await api.resetUserPassword('helper');
		expect(reset.tempPassword).not.toBe(created.tempPassword);
		expect((await api.listUsers()).find((u) => u.username === 'helper')?.mustChange).toBe(true);
		await expect(api.resetUserPassword('nobody')).rejects.toMatchObject({ status: 404 });
	});
	it('tag desk (twin baseline): feature/rename-propagates/delete-guard mirror lumen', async () => {
		const api = createMockApi();
		// create + feature
		await api.createTag('Harness Desk Tag');
		const row = await api.updateTag('harness-desk-tag', { featured: true });
		expect(row).toMatchObject({ name: 'harness-desk-tag', posts: 0, featured: true });
		// rename propagates: attach to a draft, rename, the post follows
		const created = await api.createPost(
			draft({ slug: 'desk-rename-me', tags: ['harness-desk-tag'] })
		);
		expect(created.tags).toContain('harness-desk-tag');
		const renamed = await api.updateTag('harness-desk-tag', { name: 'Harness Desk Renamed' });
		expect(renamed.name).toBe('harness-desk-renamed');
		const post = await api.getPost('desk-rename-me');
		expect(post.tags).toContain('harness-desk-renamed');
		// collision refuses
		await expect(api.updateTag('harness-desk-renamed', { name: 'queues' })).rejects.toMatchObject({
			status: 409
		});
		// delete refuses while referenced — the message NAMES the count
		await expect(api.deleteTag('harness-desk-renamed')).rejects.toMatchObject({
			status: 409
		});
		await api.deletePost('desk-rename-me');
		await api.deleteTag('harness-desk-renamed'); // freed → gone
		const list = await api.listTags();
		expect(list.find((x) => x.name === 'harness-desk-renamed')).toBeUndefined();
		await expect(api.updateTag('ghost-tag', { featured: true })).rejects.toMatchObject({
			status: 404
		});
	});

	it('tags: first-class vocabulary (unused names appear at 0), createTag slugifies, 409s', async () => {
		const api = createMockApi();
		const before = await api.listTags();
		const t = await api.createTag('Edge Computing!!');
		expect(t).toMatchObject({ name: 'edge-computing', posts: 0, featured: false });
		const after = await api.listTags();
		expect(after.find((x) => x.name === 'edge-computing')).toMatchObject({
			name: 'edge-computing',
			posts: 0,
			featured: false
		});
		await expect(api.createTag('edge-computing')).rejects.toMatchObject({ status: 409 });
		await expect(api.createTag('!!!')).rejects.toMatchObject({ status: 400 });
		expect(after.length).toBe(before.length + 1);
		// counts still measure the PUBLISHED corpus only
		await api.publishPost('queues-unacked');
		const tags = await api.listTags();
		expect(tags.find((t2) => t2.name === 'queues')?.posts).toBe(2);
		expect(tags.find((t2) => t2.name === 'backpressure')?.posts).toBe(1);
		expect(tags.find((t2) => t2.name === 'latency')?.posts).toBe(0); // seeded-but-unpublished tag
		for (let i = 1; i < tags.length; i++)
			expect(tags[i - 1].posts).toBeGreaterThanOrEqual(tags[i].posts);
	});

	it('tag desk api layer (twin): timestamps, fuzzy search pages, newest order, bulk', async () => {
		const api = createMockApi();
		// rows carry lifecycle stamps: live creates get now(), seeds stable fixtures
		const obs = await api.createTag('Observability');
		expect(obs.name).toBe('observability');
		expect(obs.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		expect(obs.updatedAt).toBe(obs.createdAt);
		const seeded = (await api.listTags()).find((t) => t.name === 'queues')!;
		expect(seeded.createdAt).toBe(seeded.updatedAt); // untouched seed

		// searchTags: lumen's fuzzy engine approximated prefix-then-contains,
		// paged honestly (total = FULL match count, not the page's size)
		const hit = await api.searchTags('obs');
		expect(hit.total).toBeGreaterThanOrEqual(1);
		expect(hit.items.map((t) => t.name)).toContain('observability');
		// typo-tolerant-ish stem: a truncated name still finds the full one
		expect((await api.searchTags('backpress')).items.map((t) => t.name)).toContain('backpressure');
		// pagination across 2 pages: backpressure, latency, observability hold 'a'
		const p1 = await api.searchTags('a', 1, 2);
		expect(p1.pageSize).toBe(2);
		expect(p1.page).toBe(1);
		expect(p1.items).toHaveLength(2);
		expect(p1.total).toBe(3);
		const p2 = await api.searchTags('a', 2, 2);
		expect(p2.total).toBe(3);
		expect(p2.items).toHaveLength(1);
		const names = new Set([...p1.items, ...p2.items].map((t) => t.name));
		expect(names.size).toBe(3); // pages don't overlap

		// listNewestTags: created_at DESC — the fresh tag leads the fixture stamps
		const newest = await api.listNewestTags();
		expect(newest[0].name).toBe('observability');

		// bulk feature reports the honest delta: 'queues' is seeded-featured,
		// observability is not → exactly ONE row changes
		expect(await api.bulkFeatureTags(['queues', 'observability'], true)).toBe(1);
		const rows = await api.listTags();
		expect(rows.find((t) => t.name === 'observability')?.featured).toBe(true);
		expect(rows.find((t) => t.name === 'queues')!.updatedAt).toBe(seeded.updatedAt);
		// flipping BOTH off moves BOTH rows
		expect(await api.bulkFeatureTags(['queues', 'observability'], false)).toBe(2);
		// unknown names are not failures — they simply changed nothing
		expect(await api.bulkFeatureTags(['ghost-tag'], true)).toBe(0);
	});

	it('photos: uploads land bytes in the media store, src is a serving URL', async () => {
		const api = createMockApi();
		const png = new Blob(['png-bytes'], { type: 'image/png' });
		const created = await api.addPhoto({ name: 'alpine dawn.png', file: png });
		expect(created.src).toMatch(/^\/api\/media\/m\d+$/);
		expect(created.alt).toBe('alpine dawn');
		// fresh captures start private & uncategorized — curation is deliberate
		expect(created.gallery).toBe(false);
		expect(created.collection).toBeNull();
		expect(created.exif).toBeNull(); // no capture sent — the honest empty state
		expect(mediaStore.get(created.id)).toBe(png); // the Blob, undecoded
		const list = await api.listPhotos();
		expect(list.items[0].id).toBe(created.id); // newest first, seeds follow
		// the twin stores the capture verbatim — the ALLOWLIST lives in lumen;
		// the panel reads the shape identically either way (Round B)
		const jpg = new Blob(['jpg-bytes'], { type: 'image/jpeg' });
		const withExif = await api.addPhoto({
			name: 'ridge.jpg',
			file: jpg,
			exif: { camera: 'X100VI', iso: 640, aperture: 2.8, GPSLatitude: 46.5 } as never
		});
		expect(withExif.exif).toEqual({
			camera: 'X100VI',
			iso: 640,
			aperture: 2.8,
			GPSLatitude: 46.5
		});
	});

	it('photos: the stream shape is a relay concern — the twin refuses with 501', async () => {
		const api = createMockApi();
		const body = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(new Uint8Array([1, 2, 3]));
				c.close();
			}
		});
		await expect(
			api.addPhoto({ body, contentType: 'multipart/form-data; boundary=x' })
		).rejects.toMatchObject({ status: 501 });
	});

	it('curation: gallery flag + collection vocabulary, filtered/sorted lists, PATCH merges', async () => {
		const api = createMockApi();
		// seeds exercise every state
		expect((await api.listPhotos({ gallery: true })).items.map((p) => p.id).sort()).toEqual([
			'p1',
			'p3'
		]);
		expect(
			(await api.listPhotos({ collections: ['uncategorized'] })).items.map((p) => p.id)
		).toEqual(['p3']);
		// inclusive createdAt window
		expect(
			(await api.listPhotos({ from: '2024-04-01', to: '2024-04-30' })).items.map((p) => p.id).sort()
		).toEqual(['p1', 'p2']);
		// collection must exist in the vocabulary to be assignable
		await expect(api.updatePhoto('p2', { collection: 'nope' })).rejects.toMatchObject({
			status: 400
		});
		const col = await api.createCollection('Long Exposures');
		expect(col).toEqual({ name: 'long-exposures', photos: 0 });
		await expect(api.createCollection('long-exposures')).rejects.toMatchObject({ status: 409 });
		const patched = await api.updatePhoto('p2', { collection: 'long-exposures', gallery: true });
		expect(patched.collection).toBe('long-exposures');
		expect(patched.gallery).toBe(true);
		expect((await api.listCollections()).find((c) => c.name === 'long-exposures')?.photos).toBe(1);
		// unknown photo 404s
		await expect(api.updatePhoto('ghost', { gallery: true })).rejects.toMatchObject({
			status: 404
		});
		// sorting: title asc
		const byTitle = await api.listPhotos({ sort: 'title', dir: 'asc' });
		expect(byTitle.items[0].alt).toBe('Alpine ridge at dawn, fog in the valley');
	});

	it('search: one call, all content groups (posts by title/subtitle/tags, photos by alt/collection, tags by vocabulary prefix)', async () => {
		const api = createMockApi();
		const r1 = await api.search('queue');
		expect(r1.posts.map((p) => p.slug).sort()).toEqual([
			'queues-unacked',
			'shape-of-a-useful-queue'
		]);
		expect(r1.photos).toHaveLength(0);
		// 'queue' prefixes the tag vocabulary name 'queues' — the name lookup
		// door the owner asked for (/ → posts filtered by tag)
		expect(r1.tags.map((t) => t.name)).toEqual(['queues']);
		expect(r1.tags[0].posts).toBe(1); // published corpus only: shape-of-a-useful-queue
		const r2 = await api.search('market');
		expect(r2.photos.map((p) => p.id)).toEqual(['p2']);
		expect(r2.posts).toHaveLength(0);
		const r3 = await api.search('');
		expect(r3).toEqual({ posts: [], photos: [], tags: [] });
	});

	it('photo detail verbs: getPhoto 404s honestly, references scan content, delete keeps bytes', async () => {
		const api = createMockApi();
		const p = await api.getPhoto('p2');
		expect(p.alt).toContain('Night market');
		// both fixture posts embed p2's src — the USED-IN list is real
		const refs = await api.listPhotoReferences('p2');
		expect(refs.map((r) => r.slug).sort()).toEqual(['queues-unacked', 'shape-of-a-useful-queue']);
		await expect(api.getPhoto('nope')).rejects.toThrow(/not found/);
		await api.deletePhoto('p2');
		await expect(api.getPhoto('p2')).rejects.toThrow(/not found/);
		const list = await api.listPhotos();
		expect(list.items.map((x) => x.id)).not.toContain('p2');
	});

	it('login demands non-empty credentials (lumen will actually check)', async () => {
		const api = createMockApi();
		await expect(api.login('', 'x')).rejects.toBeInstanceOf(AdminApiError);
		await expect(api.login('gofar', 'x')).resolves.toHaveProperty('token');
	});

	it('session contract: server decides the TTL (expiresIn seconds), logout resolves', async () => {
		const api = createMockApi();
		const s = await api.login('gofar', 'x');
		// the login action sizes the cookie from THIS, not from a constant
		expect(s.expiresIn).toBe(60 * 60 * 12);
		// mock-era revoke is a documented no-op; Phase B bumps token_version
		await expect(api.logout()).resolves.toBeUndefined();
	});
});

describe('tasks + notifications twin (M4.C)', () => {
	// A fixed Friday noon UTC makes the seeded calendar deterministic: the
	// gate is due today at 17:00Z, paint yesterday (overdue), plants done.
	const T0 = Date.parse('2026-11-27T12:00:00Z');
	function twin(start = T0) {
		let clock = start;
		const api = createMockApi({ now: () => clock });
		return { api, advance: (ms: number) => (clock += ms) };
	}

	it('tasks: the seeded workspace is coherent — projects, views, four cards', async () => {
		const { api } = twin();
		const ws = await api.tasksWorkspace({ view: 'all', timezone: 'UTC' });
		expect(ws.projects).toHaveLength(1);
		expect(ws.projects[0]).toMatchObject({
			name: 'Home',
			role: 'admin',
			taskCount: 3,
			openCount: 2,
			completedAt: null
		});
		expect(ws.stats).toEqual({ open: 2, dueToday: 1, completedWeek: 1, overdue: 1 });
		expect(ws.tasks.map((t) => t.title)).toEqual(['Buy paint', 'Fix the gate', 'Water the plants']);
		expect(ws.tasks.find((t) => t.title === 'Fix the gate')).toMatchObject({
			projectName: 'Home',
			priority: 'high',
			assigneeName: 'admin',
			commentCount: 0,
			subtaskCount: 0
		});
		// today = due today + still-open overdue; upcoming = strictly future days
		expect(
			(await api.tasksWorkspace({ view: 'today', timezone: 'UTC' })).tasks.map((t) => t.title)
		).toEqual(['Buy paint', 'Fix the gate']);
		expect((await api.tasksWorkspace({ view: 'upcoming', timezone: 'UTC' })).tasks).toEqual([]);
		expect(await api.taskStats('UTC')).toEqual(ws.stats);
		// The day keys are the CLIENT's (X-Client-Timezone): at 12:00Z the
		// gate's 17:00Z due is already tomorrow in Tokyo (UTC+9).
		const ahead = await api.tasksWorkspace({ view: 'upcoming', timezone: 'Asia/Tokyo' });
		expect(ahead.tasks.map((t) => t.title)).toEqual(['Fix the gate']);
		expect((await api.taskStats('Asia/Tokyo')).dueToday).toBe(0);
	});

	it('tasks: project → invite → accept → assign → toggle → stats shape', async () => {
		const { api } = twin();
		const project = await api.taskProjectCreate('  Garden  ');
		expect(project).toMatchObject({
			name: 'Garden',
			role: 'admin',
			taskCount: 0,
			openCount: 0,
			completedAt: null
		});
		expect(await api.taskInvites()).toEqual([]); // the invite is the INVITEE's inbox
		const invite = await api.taskInviteCreate(project.id, 'sarah');
		expect(invite).toMatchObject({
			projectId: project.id,
			projectName: 'Garden',
			inviterName: 'admin'
		});

		const sarah = api.as('sarah');
		expect((await sarah.taskInvites()).map((i) => i.id)).toContain(invite.id);
		expect((await sarah.taskInviteAccept(invite.id)).id).toBe(invite.id);
		expect((await sarah.taskInvites()).map((i) => i.id)).not.toContain(invite.id);
		expect(
			(await sarah.tasksWorkspace({ view: 'all', timezone: 'UTC' })).projects
				.map((p) => p.name)
				.sort()
		).toEqual(['Garden']);

		const members = await api.taskMembers(project.id);
		expect(members.map((m) => `${m.username}:${m.role}`).sort()).toEqual([
			'admin:admin',
			'sarah:member'
		]);
		const sarahId = members.find((m) => m.username === 'sarah')!.userId;

		const task = await api.taskCreate({
			projectId: project.id,
			title: 'Paint the fence',
			notes: 'two coats',
			priority: 'high',
			dueAt: '2026-11-27T16:00:00Z',
			assignedTo: sarahId
		});
		expect(task).toMatchObject({
			assigneeName: 'sarah',
			done: false,
			doneAt: null
		});
		expect(Date.parse(task.dueAt ?? '')).toBe(Date.parse('2026-11-27T16:00:00Z'));
		// the assignment's best-effort notification landed for the assignee
		const sarahNotes = await sarah.notifications({ unread: true });
		expect(
			sarahNotes.items.some((n) => n.type === 'task.assigned' && n.payload.task === task.id)
		).toBe(true);

		const toggled = await api.taskToggle(task.id);
		expect(toggled.done).toBe(true);
		expect(toggled.doneAt).toBeTruthy();
		const reopened = await api.taskToggle(task.id);
		expect(reopened).toMatchObject({ done: false, doneAt: null });

		const stats = await api.taskStats('UTC');
		expect(Object.keys(stats).sort()).toEqual(['completedWeek', 'dueToday', 'open', 'overdue']);
		expect(stats.open).toBe(3); // Home's two open + the fence
		expect(stats.dueToday).toBe(2); // the gate + the fence, both due today in UTC

		const detail = await api.taskGet(task.id);
		expect(detail.activity.map((a) => a.verb)).toEqual([
			'created',
			'assigned',
			'completed',
			'reopened'
		]);
		expect(detail.activity[1].detail).toBe('sarah');
	});

	it('tasks: statuses mirror lumen — 404 non-member, 403 role, 409 guards, 400/410 invites', async () => {
		const { api, advance } = twin();
		const home = (await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).projects[0];
		const sarah = api.as('sarah');

		// the seeded invite is the invitee's; accepting makes sarah a member
		await sarah.taskInviteAccept((await sarah.taskInvites())[0].id);
		const roster = await api.taskMembers(home.id);
		const adminId = roster.find((m) => m.role === 'admin')!.userId;
		const sarahId = roster.find((m) => m.username === 'sarah')!.userId;

		// 403: a project member cannot manage settings
		await expect(sarah.taskProjectRename(home.id, 'Nope')).rejects.toMatchObject({ status: 403 });
		// 409: the LAST admin cannot be demoted; after the promotion it can
		await expect(api.taskMemberRole(home.id, adminId, 'member')).rejects.toMatchObject({
			status: 409
		});
		await api.taskMemberRole(home.id, sarahId, 'admin');
		await api.taskMemberRole(home.id, adminId, 'member');
		// the caller is now a plain member, so the settings verb is 403 again
		await expect(api.taskProjectRename(home.id, 'Nope')).rejects.toMatchObject({ status: 403 });
		await sarah.taskProjectRename(home.id, 'Home base');
		expect((await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).projects[0].name).toBe(
			'Home base'
		);

		// C3: the assignee must be a project member (409, not 404)
		const helper = await api.createUser('helper', ['content:manage']);
		await expect(
			api.taskCreate({ projectId: home.id, title: 'x', assignedTo: helper.id })
		).rejects.toMatchObject({ status: 409 });
		// a non-member's reads and writes are the ONE denial voice (404)
		const outsider = api.as('helper');
		await expect(outsider.taskGet('twin-task-gate')).rejects.toMatchObject({ status: 404 });
		await expect(outsider.taskMembers(home.id)).rejects.toMatchObject({ status: 404 });
		expect(await outsider.tasksWorkspace({ view: 'all' })).toEqual({
			projects: [],
			tasks: [],
			stats: { open: 0, dueToday: 0, completedWeek: 0, overdue: 0 }
		});

		// the last admin cannot be removed either; with two admins removal succeeds
		await expect(sarah.taskMemberRemove(home.id, sarahId)).rejects.toMatchObject({
			status: 409
		});
		await sarah.taskMemberRole(home.id, adminId, 'admin');
		await api.taskUpdate('twin-task-gate', { assignedTo: sarahId }); // a member may edit
		await api.taskMemberRemove(home.id, sarahId);
		expect((await api.taskMembers(home.id)).map((m) => m.username)).toEqual(['admin']);
		// removal UNASSIGNS the member's tasks in the project (C3 invariant)
		expect((await api.taskGet('twin-task-gate')).task.assignedTo).toBeNull();

		// invites: unknown = 400, already a member = 409, duplicate = 409
		await expect(api.taskInviteCreate(home.id, 'nobody')).rejects.toMatchObject({ status: 400 });
		await expect(api.taskInviteCreate(home.id, 'admin')).rejects.toMatchObject({ status: 409 });
		const pending = await api.taskInviteCreate(home.id, 'helper');
		await expect(api.taskInviteCreate(home.id, 'helper')).rejects.toMatchObject({ status: 409 });
		await api.taskInviteRevoke(home.id, pending.id);
		await expect(api.taskInviteRevoke(home.id, pending.id)).rejects.toMatchObject({
			status: 404
		});

		// the 24h TTL: acceptance is 410 and consumes the row (retry = 404)
		const late = await api.taskInviteCreate(home.id, 'helper');
		advance(25 * 3_600_000);
		await expect(outsider.taskInviteAccept(late.id)).rejects.toMatchObject({
			status: 410,
			message: 'this invite expired — ask to be re-invited'
		});
		await expect(outsider.taskInviteAccept(late.id)).rejects.toMatchObject({ status: 404 });

		// decline is the invitee's own delete (expired rows included)
		const declined = await api.taskInviteCreate(home.id, 'sarah');
		await sarah.taskInviteDecline(declined.id);
		await expect(sarah.taskInviteDecline(declined.id)).rejects.toMatchObject({ status: 404 });

		// unknown ids are not-found; an unknown view is the caller's 400
		await expect(api.taskGet('nope')).rejects.toMatchObject({ status: 404 });
		await expect(api.taskMembers('nope')).rejects.toMatchObject({ status: 404 });
		await expect(api.tasksWorkspace({ view: 'someday' as never })).rejects.toMatchObject({
			status: 400
		});
	});

	it('tasks: detail drawer, comment authorization, completion flag, soft deletes', async () => {
		const { api } = twin();
		const workspace = await api.tasksWorkspace({ view: 'all', timezone: 'UTC' });
		const home = workspace.projects[0];
		const gate = workspace.tasks.find((t) => t.title === 'Fix the gate')!;
		const sarah = api.as('sarah');
		await sarah.taskInviteAccept((await sarah.taskInvites())[0].id);

		const subtask = await api.taskSubtaskCreate(gate.id, 'Oil the hinge');
		expect(subtask).toMatchObject({ taskId: gate.id, title: 'Oil the hinge', done: false });
		expect((await api.taskSubtaskUpdate(gate.id, subtask.id, { done: true })).done).toBe(true);
		const comment = await api.taskCommentCreate(gate.id, '  ordered the parts  ');
		expect(comment).toMatchObject({ authorName: 'admin', body: 'ordered the parts' });

		const detail = await api.taskGet(gate.id);
		expect(detail.task).toMatchObject({ subtaskCount: 1, subtaskDone: 1, commentCount: 1 });
		expect(detail.subtasks.map((s) => s.title)).toEqual(['Oil the hinge']);
		expect(detail.comments[0]).toMatchObject({ authorName: 'admin', body: 'ordered the parts' });
		expect(detail.activity.map((a) => a.verb)).toContain('commented');

		// a non-author MEMBER cannot delete someone else's comment (403);
		// the project admin can
		await expect(sarah.taskCommentDelete(gate.id, comment.id)).rejects.toMatchObject({
			status: 403
		});
		await api.taskCommentDelete(gate.id, comment.id);
		await api.taskSubtaskDelete(gate.id, subtask.id);
		expect((await api.taskGet(gate.id)).task).toMatchObject({
			commentCount: 0,
			subtaskCount: 0,
			subtaskDone: 0
		});

		// the completed flag keeps the ORIGINAL instant on repeat; false reopens
		expect(await api.taskProjectComplete(home.id, true)).toBe(true);
		const stamp = (await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).projects[0]
			.completedAt;
		expect(stamp).toBeTruthy();
		expect(await api.taskProjectComplete(home.id, true)).toBe(true);
		expect(
			(await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).projects[0].completedAt
		).toBe(stamp);
		expect(await api.taskProjectComplete(home.id, false)).toBe(false);
		expect(
			(await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).projects[0].completedAt
		).toBeNull();

		// rename propagates through every joined task wire
		await api.taskProjectRename(home.id, 'House');
		expect((await api.taskGet(gate.id)).task.projectName).toBe('House');

		// TASK soft delete: gone from the list and the detail
		await api.taskDelete(gate.id);
		expect(
			(await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).tasks.map((t) => t.id)
		).not.toContain(gate.id);
		await expect(api.taskGet(gate.id)).rejects.toMatchObject({ status: 404 });

		// PROJECT soft delete: every live read hides it (history stays behind)
		await api.taskProjectDelete(home.id);
		expect((await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).projects).toEqual([]);
		expect((await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).tasks).toEqual([]);
		await expect(api.taskMembers(home.id)).rejects.toMatchObject({ status: 404 });
		expect(await api.taskStats('UTC')).toEqual({
			open: 0,
			dueToday: 0,
			completedWeek: 0,
			overdue: 0
		});
	});

	it('tasks: PATCH is three-way — absent leaves, null clears, a value sets', async () => {
		const { api } = twin();
		const gate = (await api.tasksWorkspace({ view: 'all', timezone: 'UTC' })).tasks.find(
			(t) => t.title === 'Fix the gate'
		)!;
		expect(gate.dueAt).toBeTruthy();
		expect(gate.assignedTo).toBe('twin-admin');

		// absent keys leave BOTH fields untouched
		const titleOnly = await api.taskUpdate(gate.id, { title: 'Fix the front gate' });
		expect(titleOnly).toMatchObject({
			title: 'Fix the front gate',
			dueAt: gate.dueAt,
			assignedTo: gate.assignedTo
		});
		// explicit null clears (the adapter must SHIP the key, never omit it)
		const cleared = await api.taskUpdate(gate.id, { dueAt: null, assignedTo: null });
		expect(cleared).toMatchObject({ dueAt: null, assignedTo: null, assigneeName: null });
		// a value sets again; a malformed due is the caller's 400
		const roster = await api.taskMembers(gate.projectId);
		const adminId = roster[0].userId;
		expect((await api.taskUpdate(gate.id, { assignedTo: adminId })).assignedTo).toBe(adminId);
		await expect(api.taskUpdate(gate.id, { dueAt: 'not-a-date' })).rejects.toMatchObject({
			status: 400
		});
	});

	it('tasks: the project filter narrows tasks only; the cards stay membership-wide', async () => {
		const { api } = twin();
		const garden = await api.taskProjectCreate('Garden');
		await api.taskCreate({
			projectId: garden.id,
			title: 'Plant bulbs',
			dueAt: '2026-12-01T09:00:00Z'
		});
		const ws = await api.tasksWorkspace({ view: 'all', projectId: garden.id, timezone: 'UTC' });
		expect(ws.projects.map((p) => p.name).sort()).toEqual(['Garden', 'Home']);
		expect(ws.tasks.map((t) => t.title)).toEqual(['Plant bulbs']);
		expect(ws.stats.open).toBe(3); // lumen computes the cards over the membership
		await expect(
			api.tasksWorkspace({ view: 'all', projectId: 'nope', timezone: 'UTC' })
		).rejects.toMatchObject({ status: 404 });
	});

	it('notifications: unread filter, cursor paging, read/mark-all, TTL invisibility', async () => {
		const { api, advance } = twin();
		const first = await api.notifications();
		expect(first.items.map((n) => n.type)).toEqual(['task.assigned', 'content.published']);
		expect(first.nextBefore).toBeNull();
		expect(first.items[0].readAt).toBeNull();
		expect(first.items[1].readAt).toBeTruthy(); // the older row is already read
		expect(await api.notificationsUnreadCount()).toBe(1);
		expect((await api.notifications({ unread: true })).items.map((n) => n.type)).toEqual([
			'task.assigned'
		]);

		// the cursor pages by the last row's exact instant, strict `<`
		const page1 = await api.notifications({ limit: 1 });
		expect(page1.items.map((n) => n.id)).toEqual([first.items[0].id]);
		expect(page1.nextBefore).toBe(first.items[0].createdAt);
		const page2 = await api.notifications({ before: page1.nextBefore!, limit: 1 });
		expect(page2.items.map((n) => n.id)).toEqual([first.items[1].id]);
		const page3 = await api.notifications({ before: page2.nextBefore!, limit: 1 });
		expect(page3.items).toEqual([]);

		// mark-read is idempotent; foreign/expired/unknown share the 404
		await api.notificationMarkRead(first.items[0].id);
		expect(await api.notificationsUnreadCount()).toBe(0);
		await api.notificationMarkRead(first.items[0].id);
		await expect(api.notificationMarkRead('twin-nope')).rejects.toMatchObject({ status: 404 });

		// mark-all reports the honest moved count (sarah's seeded invite row)
		const sarah = api.as('sarah');
		expect(await sarah.notificationsUnreadCount()).toBe(1);
		expect(await sarah.notificationsMarkAllRead()).toBe(1);
		expect(await sarah.notificationsMarkAllRead()).toBe(0);
		expect(await sarah.notificationsUnreadCount()).toBe(0);

		// TTL is DATA: expired rows vanish from list/count/mark-read (no purge)
		advance(31 * 86_400_000);
		expect(await api.notifications()).toEqual({ items: [], nextBefore: null });
		expect(await api.notificationsUnreadCount()).toBe(0);
		await expect(api.notificationMarkRead(first.items[0].id)).rejects.toMatchObject({
			status: 404
		});
	});
});
