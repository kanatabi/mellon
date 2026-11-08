import { describe, expect, it } from 'vitest';
import { AdminApiError, type PostDraft } from './types.ts';
import { createMockApi } from './mock.ts';

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
		expect(posts).toHaveLength(3);
		expect(posts.filter((p) => p.status === 'published')).toHaveLength(1);
		expect(posts.filter((p) => p.status === 'unpublished')).toHaveLength(1);
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

	it('list filters relay server-side: status, tag OR, sort', async () => {
		const api = createMockApi();
		const drafts = await api.listPosts({ status: 'draft' });
		expect(drafts.map((p) => p.slug)).toEqual(['queues-unacked']);
		const orTags = await api.listPosts({ tag: ['latency', 'backpressure'] });
		expect(orTags.map((p) => p.slug).sort()).toEqual([
			'latency-as-product-decision',
			'shape-of-a-useful-queue'
		]);
		const newest = await api.listPosts({ sort: 'newest' });
		const oldest = await api.listPosts({ sort: 'oldest' });
		expect(oldest[0].slug).toBe(newest[newest.length - 1].slug);
		// queues-unacked was touched "now" — it heads newest, tails oldest
		expect(newest[0].slug).toBe('queues-unacked');
		expect(oldest[oldest.length - 1].slug).toBe('queues-unacked');
	});

	it('update is CAS-checked on rev (lumen §8 optimistic lock)', async () => {
		const api = createMockApi();
		const before = await api.getPost('queues-unacked');
		await expect(
			api.updatePost('queues-unacked', draft({ slug: 'queues-unacked' }), 99)
		).rejects.toMatchObject({ status: 412 });
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
			status: 412
		});
		const next = await api.writeSecret('lumen', 'staging', { A: '1' }, 2);
		expect(next).toBe(3);
		const read = await api.readSecret('lumen', 'staging', 2); // old version stays readable
		expect(read?.data.MEILI_URL).toContain('meilisearch');
		const gone = await api.readSecret('ghost', 'prod');
		expect(gone).toBeNull();
	});

	it('tags count the published corpus only, descending', async () => {
		const api = createMockApi();
		await api.publishPost('queues-unacked');
		const tags = await api.listTags();
		expect(tags.find((t) => t.name === 'queues')?.posts).toBe(2);
		expect(tags.find((t) => t.name === 'backpressure')?.posts).toBe(1);
		for (let i = 1; i < tags.length; i++)
			expect(tags[i - 1].posts).toBeGreaterThanOrEqual(tags[i].posts);
	});

	it('login demands non-empty credentials (lumen will actually check)', async () => {
		const api = createMockApi();
		await expect(api.login('', 'x')).rejects.toBeInstanceOf(AdminApiError);
		await expect(api.login('gofar', 'x')).resolves.toHaveProperty('token');
	});
});
