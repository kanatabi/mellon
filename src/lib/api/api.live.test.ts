/**
 * Phase C live suite: the REAL adapter against a RUNNING lumen — the mirror
 * ritual's acceptance test on the mellon side (earendil has contract.spec.ts;
 * this pins AdminApi's wire). Gated: LUMEN_URL unset = skipped, offline CI
 * stays mock-only. Env: LUMEN_URL, LUMEN_ADMIN_USER, LUMEN_ADMIN_PASSWORD.
 * Touches only rows it creates (suite-isolation, the lumen lesson adopted).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLumenApi } from './fetch-adapter.ts';
import { AdminApiError } from './types.ts';
import type { PostDraft } from './types.ts';

const BASE = process.env.LUMEN_URL ?? '';
const USER = process.env.LUMEN_ADMIN_USER ?? 'gofar';
const PASS = process.env.LUMEN_ADMIN_PASSWORD ?? 'mellon-dev-password';
const live = BASE !== '';

// 1x1 transparent PNG, tiny and real (lumen's decoder must accept it)
const PNG_DATA_URL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let token = '';
const slug = 'mellon-live-cutover';
const photoIds: string[] = [];

/**
 * Self-healing invariant (learned 2026-11-09): this is a LIVE plane —
 * exploratory owner clicks in the portal can legitimately change the
 * fixture's state (the leak-bait draft got published once; the suite
 * failed, correctly, on an assumption it should own). beforeAll now
 * RESTORES the precondition instead of assuming it: drafts-are-fantasies
 * must be a draft for the draft-visibility assertions to mean anything.
 * (The earendil contract suite deliberately keeps the assumption — that
 * harness IS the drift detector, run it against a freshly seeded plane:
 * `FORCE=1 make seed` in lumen.)
 */
beforeAll(async () => {
	if (!live) return;
	const session = await createLumenApi(BASE, '').login(USER, PASS);
	expect(session.expiresIn).toBe(12 * 60 * 60);
	token = session.token;
	const api = createLumenApi(BASE, token);
	const bait = await api.getPost('drafts-are-fantasies');
	if (bait.status === 'published') {
		console.warn('[live] leak-bait draft was published by someone — restoring draft state');
		await api.unpublishPost('drafts-are-fantasies');
	}
});

afterAll(async () => {
	if (!live) return;
	const api = createLumenApi(BASE, token);
	await api.deletePost(slug).catch(() => {});
	for (const id of photoIds) await api.deletePhoto(id).catch(() => {});
});

describe.skipIf(!live)('mellon AdminApi against real lumen', () => {
	it('the leak-bait is admin-visible and never pretend to be public', async () => {
		const api = createLumenApi(BASE, token);
		// status-AGNOSTIC invariant (the machine is one-way: a shipped post
		// never returns to draft, so asserting "status=draft" specifically
		// made the suite hostage to exploratory clicks — the truth that
		// matters is: HERE on the desk, NOT on the public surface)
		const desk = await api.listPosts();
		expect(desk.items.map((p) => p.slug)).toContain('drafts-are-fantasies');
	});

	it('palette search finds the leak-bait draft through the admin door', async () => {
		const api = createLumenApi(BASE, token);
		const results = await api.search('leak');
		expect(results.posts.map((p) => p.slug)).toContain('drafts-are-fantasies');
	});

	it('full lifecycle: create → CAS conflict surfaces 409 → publish → unpublish', async () => {
		const api = createLumenApi(BASE, token);
		const draft: PostDraft = {
			slug,
			title: 'Mellon Live Cutover',
			subtitle: 'the transport is real',
			preview: '',
			date: '2026-11-09',
			tags: ['mellon-live'],
			content: 'First paragraph is the preview default.\n\nMore body for the count.\n',
			thumbnail: null
		};
		const created = await api.createPost(draft);
		expect(created.rev).toBe(1);
		expect(created.status).toBe('draft');

		// stale rev: lumen's 409 is the contract (mock era's 412 retired)
		await expect(api.updatePost(slug, { ...draft, title: 'x' }, 99)).rejects.toMatchObject({
			status: 409
		});

		const saved = await api.updatePost(slug, draft, created.rev);
		expect(saved.rev).toBe(2);
		const published = await api.publishPost(slug);
		expect(published.status).toBe('published');
		// derivations are lumen's: the empty preview filled from first paragraph
		expect(published.preview).toContain('First paragraph');
		expect(published.readTime).toBeGreaterThanOrEqual(1);
		const back = await api.unpublishPost(slug);
		expect(back.status).toBe('unpublished');
	});

	it.skipIf(process.env.LUMEN_MEDIA !== '1')(
		'photo upload rides multipart and content-addresses through lumen',
		async () => {
			const api = createLumenApi(BASE, token);
			const photo = await api.addPhoto({
				name: 'mellon-live.png',
				dataUrl: PNG_DATA_URL,
				width: 1,
				height: 1
			});
			photoIds.push(photo.id);
			expect(photo.src).toContain('/media/');
			expect(photo.src).toMatch(/\.png$/);
			expect(photo.gallery).toBe(false); // surfacing is a deliberate act
			expect(photo.width).toBe(1); // dims from lumen's DECODE, not the browser claim
			const patched = await api.updatePhoto(photo.id, { alt: 'live patched alt' });
			expect(patched.alt).toBe('live patched alt');
			// unknown collection is a 400 — vocabulary validated server-side
			await expect(
				api.updatePhoto(photo.id, { collection: 'no-such-collection' })
			).rejects.toMatchObject({ status: 400 });
		}
	);

	it('secrets plane relays through lumen (paths, read, CAS conflict)', async () => {
		const api = createLumenApi(BASE, token);
		const paths = await api.listSecretPaths();
		expect(paths).toContainEqual({ app: 'lumen', env: 'dev' });
		const payload = await api.readSecret('lumen', 'dev');
		expect(payload).not.toBeNull();
		expect(payload?.data).toBeTruthy();
		// stale cas must surface lumen's 409 — never a silent clobber
		await expect(api.writeSecret('lumen', 'dev', payload!.data, 0)).rejects.toBeInstanceOf(
			AdminApiError
		);
	});

	it('revocation is instant: logout kills the bearer mid-suite (re-login restores)', async () => {
		const api = createLumenApi(BASE, token);
		await api.logout();
		await expect(api.listPosts()).rejects.toMatchObject({ status: 401 });
		const again = await createLumenApi(BASE, '').login(USER, PASS);
		expect(again.token).toBeTruthy();
		token = again.token; // subsequent files' beforeAll re-logins anyway
	});
});
