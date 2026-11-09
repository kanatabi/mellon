import { describe, expect, it } from 'vitest';
import { AdminApiError, POSTS_PAGE_SIZE, type PostDraft } from './types.ts';
import { createMockApi, mediaStore } from './mock.ts';

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

	it('secrets control plane (twin baseline for lumen): onboard trio, mirror fan-out, pin intent', async () => {
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
		// pin = intent (D1): recorded, surfaced, never a routing change
		await api.pinSecret('twinapp', 'dev', 2);
		expect((await api.secretMeta('twinapp', 'dev'))?.pinnedVersion).toBe(2);
		expect((await api.readSecret('twinapp', 'dev'))?.version).toBe(5); // head still wins
		await expect(api.pinSecret('twinapp', 'dev', 99)).rejects.toMatchObject({ status: 404 });
		await api.unpinSecret('twinapp', 'dev');
		expect((await api.secretMeta('twinapp', 'dev'))?.pinnedVersion).toBeNull();
	});

	it('tag desk (twin baseline): feature/rename-propagates/delete-guard mirror lumen', async () => {
		const api = createMockApi();
		// create + feature
		await api.createTag('Harness Desk Tag');
		const row = await api.updateTag('harness-desk-tag', { featured: true });
		expect(row).toEqual({ name: 'harness-desk-tag', posts: 0, featured: true });
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
		expect(t).toEqual({ name: 'edge-computing', posts: 0, featured: false });
		const after = await api.listTags();
		expect(after.find((x) => x.name === 'edge-computing')).toEqual({
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

	it('photos: uploads land bytes in the media store, src is a serving URL', async () => {
		const api = createMockApi();
		const created = await api.addPhoto({
			name: 'alpine dawn.png',
			dataUrl: 'data:image/png;base64,aW1hZ2U=',
			width: 900,
			height: 560
		});
		expect(created.src).toMatch(/^\/api\/media\/m\d+$/);
		expect(created.alt).toBe('alpine dawn');
		// fresh captures start private & uncategorized — curation is deliberate
		expect(created.gallery).toBe(false);
		expect(created.collection).toBeNull();
		expect(mediaStore.get(created.id)).toBe('data:image/png;base64,aW1hZ2U=');
		const list = await api.listPhotos();
		expect(list.items[0].id).toBe(created.id); // newest first, seeds follow
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
