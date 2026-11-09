import {
	AdminApiError,
	PHOTOS_PAGE_SIZE,
	POSTS_PAGE_SIZE,
	type AdminApi,
	type Paged
} from './types.ts';
import { slugify } from '../slug.ts';
import type {
	AdminPhoto,
	PostDetailAdmin,
	PostSummaryAdmin,
	SecretMeta,
	SecretPath,
	SecretPayload
} from './types.ts';

/**
 * In-process mock of the AdminApi — the Phase A source of truth for the UI
 * contract. Shape fidelity notes: content keeps ```mermaid fences (Route B),
 * secrets mirror Bao's KV-v2 {data, metadata} payloads, writes are CAS-checked
 * exactly like lumen's §8/§9 will be. Deviation (journal 2026-11-08): photo
 * dimensions are probed CLIENT-side here (browser Image decode) because the
 * server-side probe lives in lumen; the UI contract is unchanged.
 */

const now = () => new Date().toISOString();

const MERMAID_POST = `# The shape of a useful queue

Backpressure is a promise. When the promise breaks, the queue is the evidence.

\`\`\`mermaid
sequenceDiagram
    producer->>broker: publish (with timeout)
    broker-->>producer: ack or slow down
    consumer->>broker: poll
\`\`\`

## The three budgets

1. **Memory** — unbounded is just a crash on a timer
2. **Latency** — the queue's p99 is *your* p99
3. **Fairness** -who eats first when everyone is hungry?

- [x] measure drain rate
- [ ] set a redwater alert that fires before pain

| budget | instrument | fires when |
| --- | --- | --- |
| memory | queue_depth | sustained growth |
| latency | oldest_message_age | > SLO |

![Night market steam under a single bulb](https://picsum.photos/seed/night-market/700/900)
`;

const DRAFT_POST = `# Queues, unacked (draft)

Notes toward the next post. Still thinking about exactly-once as a *claim*.

![Night market steam under a single bulb](https://picsum.photos/seed/night-market/700/900)
`;

type StoredPost = PostDetailAdmin;

function seedPosts(): StoredPost[] {
	const pub: PostDetailAdmin = {
		slug: 'shape-of-a-useful-queue',
		title: 'The shape of a useful queue',
		subtitle: 'Backpressure, fairness, and the promises hidden between producers and consumers',
		preview: '',
		date: '2024-05-14',
		tags: ['distributed-systems', 'queues', 'backpressure'],
		content: MERMAID_POST,
		thumbnail: null,
		status: 'published',
		readTime: 8,
		rev: 3,
		createdAt: '2024-04-28T15:03:00Z',
		publishedAt: '2024-05-14T09:12:00Z',
		updatedAt: '2024-05-14T09:12:00Z'
	};
	const draft: PostDetailAdmin = {
		slug: 'queues-unacked',
		title: 'Queues, unacked',
		subtitle: 'working notes on exactly-once claims',
		preview: '',
		date: now().slice(0, 10),
		tags: ['queues'],
		content: DRAFT_POST,
		thumbnail: null,
		status: 'draft',
		readTime: 2,
		rev: 1,
		createdAt: '2026-11-07T22:40:00Z',
		publishedAt: null,
		updatedAt: now()
	};
	// third state, seeded so the UNPUBLISHED skin is exercisable from first boot
	const retired: PostDetailAdmin = {
		slug: 'latency-as-product-decision',
		title: 'When latency becomes a product decision',
		subtitle: 'a sequence diagram of promises, taken off the shelf',
		preview: 'Latency budgets are promises; someone has to sign.',
		date: '2024-02-02',
		tags: ['latency', 'product'],
		content: '# When latency becomes a product decision\n\nRetired pending a rewrite.\n',
		thumbnail: null,
		status: 'unpublished',
		readTime: 6,
		rev: 5,
		createdAt: '2024-01-20T08:00:00Z',
		publishedAt: '2024-02-02T11:30:00Z',
		updatedAt: '2026-10-19T17:25:00Z'
	};
	return [structuredClone(pub), structuredClone(draft), structuredClone(retired)];
}

const PHOTOS: AdminPhoto[] = [
	{
		id: 'p1',
		src: 'https://picsum.photos/seed/alpine-dawn/900/560',
		alt: 'Alpine ridge at dawn, fog in the valley',
		width: 900,
		height: 560,
		gallery: true, // curated: theme + public
		collection: 'landscapes',
		createdAt: '2024-04-01T05:41:00Z'
	},
	{
		id: 'p2',
		src: 'https://picsum.photos/seed/night-market/700/900',
		alt: 'Night market steam under a single bulb',
		width: 700,
		height: 900,
		gallery: false, // companion image for an article — not for the Gallery page
		collection: 'street',
		createdAt: '2024-04-06T21:03:00Z'
	},
	{
		id: 'p3',
		src: 'https://picsum.photos/seed/harbor-fog/1200/800',
		alt: 'Fog over the fishing harbour at first light',
		width: 1200,
		height: 800,
		gallery: true,
		collection: null, // in the Gallery, yet uncategorized
		createdAt: '2024-06-11T04:20:00Z'
	}
];

/** Collection vocabulary — admin-internal curation groups (owner decision
 *  2026-11-08: the blog ignores them; public = gallery=true, all themes). */
const COLLECTIONS = ['landscapes', 'street'];

/** Bao-shaped: app/env → payload versions, newest last. TWO apps ship in
 *  the twin (lumen + earendil) — "apps are DATA" was the corpus before it
 *  was the API (PLAN-SECRETS-CONTROL §2.2-1). */
const APP_SLUG = /^[a-z][a-z0-9-]{1,31}$/;
const ENV_SLUG = /^[a-z][a-z0-9-]{0,31}$/;
const DEFAULT_ENVS = ['dev', 'staging', 'production'];
/** pinned intent per app/env (D1) — null/absence is the honest unpinned. */
const PINNED: Record<string, number> = {};

const SECRETS: Record<string, SecretPayload[]> = {
	'lumen/staging': [
		{
			data: {
				API_BASE: 'http://lumen-http-server.lumen.svc.cluster.local',
				DB_HOST: 'lumen-pg-postgres.db.svc.cluster.local',
				DB_USER: 'lumen_staging'
			},
			createdTime: '2026-11-07T10:00:00Z',
			version: 1,
			destroyed: false,
			deletionTime: null
		},
		{
			data: {
				API_BASE: 'http://lumen-http-server.lumen.svc.cluster.local',
				DB_HOST: 'lumen-pg-postgres.db.svc.cluster.local',
				DB_USER: 'lumen_staging',
				MEILI_URL: 'http://meilisearch.search.svc.cluster.local:7700'
			},
			createdTime: '2026-11-08T08:30:00Z',
			version: 2,
			destroyed: false,
			deletionTime: null
		}
	],
	'earendil/staging': [
		{
			data: {
				API_BASE: '/api',
				PUBLIC_SITE_URL: 'https://staging.gofar.id'
			},
			createdTime: '2026-10-30T12:00:00Z',
			version: 1,
			destroyed: false,
			deletionTime: null
		}
	]
};

const clone = <T>(v: T): T => structuredClone(v);

/** Apply the envelope: clamp the page, slice, and tell the truth about total. */
function paged<T>(all: T[], page: number, pageSize: number): Paged<T> {
	const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
	const p = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
	return {
		total: all.length,
		items: all.slice((p - 1) * pageSize, p * pageSize),
		page: p,
		pageSize
	};
}

/**
 * Mock-era media bytes: id → data-URL. Module-level (the relay route reads
 * it outside the API object) — the same process-lifetime singleton as the
 * fixtures. Phase B replaces this whole path: bytes live in object storage,
 * `src` is the CDN URL, and mellon serves nothing.
 */
export const mediaStore = new Map<string, string>();

export function createMockApi(): AdminApi {
	let posts = seedPosts();
	let photos = clone(PHOTOS);
	const secrets: Record<string, SecretPayload[]> = structuredClone(SECRETS);
	let seq = 100;
	// Tag vocabulary — first-class, seeded from the corpus. A tag exists from
	// creation, used or not; posts may only carry vocabulary names (lumen §8
	// enforces the same; the UI never offers a non-vocab tag).
	const vocab = new Set<string>();
	for (const p of posts) for (const t of p.tags) vocab.add(t);
	// Collection vocabulary — same eager-creation semantics as tags.
	const collections = new Set<string>(COLLECTIONS);

	const find = (slug: string) => {
		const p = posts.find((x) => x.slug === slug);
		if (!p) throw new AdminApiError(404, `post not found: ${slug}`);
		return p;
	};
	const secretKey = (app: string, env: string) => `${app}/${env}`;

	return {
		async login(username, password) {
			if (!username || !password) throw new AdminApiError(401, 'credentials required');
			// mock accepts anything non-empty; lumen will actually check (Phase B).
			// Phase B mints an HS256 JWT; the mock mints an honest stand-in —
			// no fake crypto, no fake claims (the mock never verified anything)
			return {
				token: `mock.${seq++}.${btoa(username).slice(0, 8)}`,
				expiresIn: 60 * 60 * 12
			};
		},
		async logout() {
			// mock era: nothing verifies tokens, so there is nothing to revoke —
			// resolves; Phase B this bumps lumen's token_version for real
		},

		async listPosts({ status, tag, from, to, sort = 'updated', dir = 'desc', page } = {}) {
			const sum = (p: PostDetailAdmin): PostSummaryAdmin => ({
				slug: p.slug,
				title: p.title,
				subtitle: p.subtitle,
				status: p.status,
				createdAt: p.createdAt,
				publishedAt: p.publishedAt,
				updatedAt: p.updatedAt,
				rev: p.rev
			});
			const filtered = posts
				.filter(
					(p) =>
						(!status || p.status === status) &&
						// OR semantics on tags, mirroring the public list contract
						(!tag?.length || p.tags.some((t) => tag.includes(t))) &&
						// inclusive editorial-date window (ISO compares lexicographically)
						(!from || p.date >= from) &&
						(!to || p.date <= to)
				)
				.sort((a, b) => {
					const key = (p: PostDetailAdmin) =>
						sort === 'title'
							? p.title.toLowerCase()
							: sort === 'created'
								? p.createdAt
								: sort === 'published'
									? (p.publishedAt ?? '') // never-published sink to the tail
									: p.updatedAt;
					const cmp = key(a).localeCompare(key(b));
					return dir === 'asc' ? cmp : -cmp;
				})
				.map(sum);
			return paged(filtered, page ?? 1, POSTS_PAGE_SIZE);
		},

		async getPost(slug) {
			return clone(find(slug));
		},

		async createPost(draft) {
			if (posts.some((p) => p.slug === draft.slug))
				throw new AdminApiError(409, `slug exists: ${draft.slug}`);
			const created: PostDetailAdmin = {
				...clone(draft),
				status: 'draft',
				readTime: Math.max(1, Math.round(draft.content.split(/\s+/).length / 200)),
				rev: 1,
				createdAt: now(),
				publishedAt: null,
				updatedAt: now()
			};
			posts.push(created);
			return clone(created);
		},

		async updatePost(slug, draft, rev) {
			const p = find(slug);
			// CAS: optimistic lock, exactly like lumen §8's rev-checked PUT.
			if (p.rev !== rev)
				throw new AdminApiError(409, `conflict: expected rev ${rev}, current ${p.rev}`);
			Object.assign(p, clone(draft), { rev: p.rev + 1, updatedAt: now() });
			p.readTime = Math.max(1, Math.round(draft.content.split(/\s+/).length / 200));
			return clone(p);
		},

		async publishPost(slug) {
			const p = find(slug);
			// the §2 unit of work, mocked: preview default + status flip. Reachable
			// from draft or unpublished ONLY — the §4 state machine has no other
			// inbound edge and none out of published back to draft.
			if (p.status === 'published') return clone(p); // idempotent republish
			if (!p.preview)
				p.preview =
					p.content
						.replace(/^#.*$/m, '')
						.trim()
						.split(/\n\s*\n/)[0] ?? '';
			p.status = 'published';
			p.publishedAt = now();
			p.rev += 1;
			p.updatedAt = now();
			return clone(p);
		},

		async unpublishPost(slug) {
			const p = find(slug);
			// §4 state machine: published → unpublished (terminal-ish). A post
			// never travels back to draft once it has shipped.
			if (p.status !== 'published')
				throw new AdminApiError(409, `only a published post can be unpublished (is ${p.status})`);
			p.status = 'unpublished';
			p.rev += 1;
			p.updatedAt = now();
			return clone(p);
		},

		async deletePost(slug) {
			posts = posts.filter((p) => p.slug !== slug);
		},

		async listPhotos({
			collections,
			gallery,
			from,
			to,
			sort = 'created',
			dir = 'desc',
			page
		} = {}) {
			const filtered = photos
				.filter(
					(p) =>
						(!collections?.length ||
							collections.some((c) =>
								c === 'uncategorized' ? p.collection === null : p.collection === c
							)) &&
						(gallery === undefined || p.gallery === gallery) &&
						// inclusive window on the day portion (ISO compares lexicographically)
						(!from || p.createdAt.slice(0, 10) >= from) &&
						(!to || p.createdAt.slice(0, 10) <= to)
				)
				.sort((a, b) => {
					const key = (p: AdminPhoto) =>
						sort === 'title'
							? p.alt.toLowerCase()
							: sort === 'collection'
								? (p.collection ?? '')
								: p.createdAt;
					const cmp = key(a).localeCompare(key(b));
					return dir === 'asc' ? cmp : -cmp;
				});
			const env = paged(filtered, page ?? 1, PHOTOS_PAGE_SIZE);
			return { ...env, items: env.items.map(clone) };
		},

		async addPhoto(p) {
			// deviation (journal 2026-11-08): bytes as a data-URL in the mock;
			// lumen takes multipart, probes dims + strips EXIF server-side.
			const id = `m${seq++}`;
			mediaStore.set(id, p.dataUrl);
			const created: AdminPhoto = {
				id,
				src: `/api/media/${id}`,
				alt: p.name.replace(/\.[^.]+$/, ''),
				width: p.width,
				height: p.height,
				// fresh captures start private & uncategorized — curation is deliberate
				gallery: false,
				collection: null,
				createdAt: now()
			};
			photos = [created, ...photos];
			return clone(created);
		},

		async updatePhoto(id, patch) {
			const p = photos.find((x) => x.id === id);
			if (!p) throw new AdminApiError(404, `photo not found: ${id}`);
			if (patch.alt !== undefined) p.alt = patch.alt;
			if (patch.gallery !== undefined) p.gallery = patch.gallery;
			if (patch.collection !== undefined) {
				if (patch.collection !== null && !collections.has(patch.collection))
					throw new AdminApiError(400, `unknown collection: ${patch.collection}`);
				p.collection = patch.collection;
			}
			return clone(p);
		},

		async getPhoto(id) {
			const p = photos.find((x) => x.id === id);
			if (!p) throw new AdminApiError(404, `photo not found: ${id}`);
			return clone(p);
		},

		async listPhotoReferences(id) {
			const p = photos.find((x) => x.id === id);
			if (!p) throw new AdminApiError(404, `photo not found: ${id}`);
			// the honest Phase-A stand-in for lumen's content scan: substring
			// over raw markdown — embeds keep src verbatim by doctrine
			return posts
				.filter((post) => post.content.includes(p.src))
				.map((post) => ({ slug: post.slug, title: post.title }));
		},

		async deletePhoto(id) {
			const i = photos.findIndex((x) => x.id === id);
			if (i === -1) throw new AdminApiError(404, `photo not found: ${id}`);
			photos.splice(i, 1);
			// mediaStore bytes deliberately KEPT — the GC-window semantics of
			// Phase B (object survives until lifecycle sweep) made tangible
		},

		async listCollections() {
			return [...collections]
				.map((name) => ({ name, photos: photos.filter((p) => p.collection === name).length }))
				.sort((a, b) => b.photos - a.photos || a.name.localeCompare(b.name));
		},

		async createCollection(raw) {
			const name = slugify(String(raw ?? '')).slice(0, 32);
			if (!name) throw new AdminApiError(400, 'collection name has no letters or digits');
			if (collections.has(name)) throw new AdminApiError(409, `collection exists: ${name}`);
			collections.add(name);
			return { name, photos: 0 };
		},

		async listTags() {
			const counts = new Map<string, number>();
			for (const p of posts) {
				if (p.status !== 'published') continue; // counts = published corpus
				for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
			}
			// Every vocabulary name appears — unused tags at 0.
			return [...vocab]
				.map((name) => ({ name, posts: counts.get(name) ?? 0 }))
				.sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name));
		},

		async createTag(raw) {
			const name = slugify(String(raw ?? '')).slice(0, 32);
			if (!name) throw new AdminApiError(400, 'tag name has no letters or digits');
			if (vocab.has(name)) throw new AdminApiError(409, `tag exists: ${name}`);
			vocab.add(name);
			return { name, posts: 0 };
		},

		async search(qRaw) {
			const q = String(qRaw ?? '')
				.trim()
				.toLowerCase();
			if (!q) return { posts: [], photos: [], tags: [] };
			const matched = posts
				.filter((p) => `${p.title} ${p.subtitle} ${p.tags.join(' ')}`.toLowerCase().includes(q))
				.slice(0, 8)
				.map((p): PostSummaryAdmin => ({
					slug: p.slug,
					title: p.title,
					subtitle: p.subtitle,
					status: p.status,
					createdAt: p.createdAt,
					publishedAt: p.publishedAt,
					updatedAt: p.updatedAt,
					rev: p.rev
				}));
			// photos match on alt + collection — the curation vocabulary people
			// actually remember; Meilisearch fuzziness arrives with lumen (§4)
			const pics = photos
				.filter((p) => `${p.alt} ${p.collection ?? ''}`.toLowerCase().includes(q))
				.slice(0, 8)
				.map(clone);
			// tags are a VOCABULARY prefix match (name lookup, not relevance
			// search) — lumen serves it from Postgres, not Meilisearch
			const tagHits = [...vocab]
				.filter((t) => t.startsWith(q))
				.sort()
				.slice(0, 8)
				.map((name) => ({
					name,
					// same counting rule as listTags: published corpus
					posts: posts.filter((p) => p.status === 'published' && p.tags.includes(name)).length
				}));
			return { posts: matched, photos: pics, tags: tagHits };
		},

		async listSecretPaths(): Promise<SecretPath[]> {
			return Object.keys(secrets).map((k) => {
				const [app, env] = k.split('/');
				return { app, env };
			});
		},

		async readSecret(app, env, version) {
			const list = secrets[secretKey(app, env)];
			if (!list) return null;
			const v = version ?? list[list.length - 1].version;
			const found = list.find((s) => s.version === v);
			return found ? clone(found) : null;
		},

		async secretMeta(app, env): Promise<SecretMeta | null> {
			const list = secrets[secretKey(app, env)];
			if (!list) return null;
			return {
				currentVersion: list[list.length - 1].version,
				pinnedVersion: PINNED[secretKey(app, env)] ?? null,
				versions: list.map((s) => ({
					version: s.version,
					createdTime: s.createdTime,
					destroyed: s.destroyed
				}))
			};
		},

		async writeSecret(app, env, data, cas) {
			const key = secretKey(app, env);
			const list = (secrets[key] ??= []);
			const current = list.length ? list[list.length - 1].version : 0;
			if (cas !== current)
				throw new AdminApiError(409, `CAS failed: expected ${cas}, current ${current}`);
			const created: SecretPayload = {
				data: clone(data),
				createdTime: now(),
				version: current + 1,
				destroyed: false,
				deletionTime: null
			};
			list.push(created);
			// KEY-SET MIRROR (§2.1): reconcile every sibling env's shape to
			// the saved set — adds land EMPTY (values are per-env), removes
			// propagate, existing sibling values survive. Reconcile (not
			// delta-vs-old-head): an interrupted mirror heals on the next
			// write. The twin is the BEHAVIOR baseline lumen is held to —
			// the invariant lives here as much as the shapes do.
			const savedKeys = Object.keys(data);
			for (const k of Object.keys(secrets)) {
				if (!k.startsWith(`${app}/`) || k === key) continue;
				const sibList = secrets[k];
				const sib = sibList[sibList.length - 1];
				const adds = savedKeys.filter((x) => !(x in sib.data));
				const removes = Object.keys(sib.data).filter((x) => !savedKeys.includes(x));
				if (!adds.length && !removes.length) continue;
				const next = clone(sib.data);
				for (const a of adds) next[a] = '';
				for (const r of removes) delete next[r];
				sibList.push({
					data: next,
					createdTime: now(),
					version: sib.version + 1,
					destroyed: false,
					deletionTime: null
				});
			}
			return created.version;
		},

		async onboardApp(app, envs) {
			if (!APP_SLUG.test(app)) throw new AdminApiError(400, 'app fails slug shape validation');
			const list = envs?.length ? envs : DEFAULT_ENVS;
			for (const e of list)
				if (!ENV_SLUG.test(e)) throw new AdminApiError(400, 'env fails slug shape validation');
			const uniq = [...new Set(list)];
			if (Object.keys(secrets).some((k) => k.startsWith(`${app}/`)))
				throw new AdminApiError(409, 'app namespace already exists');
			for (const e of uniq)
				secrets[`${app}/${e}`] = [
					{
						data: {},
						createdTime: now(),
						version: 1,
						destroyed: false,
						deletionTime: null
					}
				];
			return { app, envs: uniq };
		},

		async addEnv(app, env) {
			if (!APP_SLUG.test(app) || !ENV_SLUG.test(env))
				throw new AdminApiError(400, 'app/env fails slug shape validation');
			const k = secretKey(app, env);
			if (secrets[k]) throw new AdminApiError(409, 'env already exists for this app');
			const siblings = Object.keys(secrets).filter((x) => x.startsWith(`${app}/`));
			if (!siblings.length) throw new AdminApiError(404, 'app has no envs — onboard it first');
			const union = [
				...new Set(siblings.flatMap((x) => Object.keys(secrets[x].at(-1)!.data)))
			].sort();
			secrets[k] = [
				{
					data: Object.fromEntries(union.map((key) => [key, ''])),
					createdTime: now(),
					version: 1,
					destroyed: false,
					deletionTime: null
				}
			];
			return { app, env };
		},

		async pinSecret(app, env, version) {
			const list = secrets[secretKey(app, env)];
			if (!list) throw new AdminApiError(404, 'secret path not found');
			const live = list.find((p) => p.version === version && !p.destroyed);
			if (!version || !live)
				throw new AdminApiError(404, 'pin version is not a live version of this secret');
			PINNED[secretKey(app, env)] = version;
			return { pinnedVersion: version };
		},

		async unpinSecret(app, env) {
			const k = secretKey(app, env);
			if (!secrets[k]) throw new AdminApiError(404, 'secret path not found');
			delete PINNED[k];
		}
	};
}

/** Singleton for the session (module state = the "server process"). */
export const mockApi = createMockApi();
