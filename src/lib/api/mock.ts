import { AdminApiError, type AdminApi } from './types.ts';
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
`;

const DRAFT_POST = `# Queues, unacked (draft)

Notes toward the next post. Still thinking about exactly-once as a *claim*.
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
		createdAt: '2024-04-01T05:41:00Z'
	},
	{
		id: 'p2',
		src: 'https://picsum.photos/seed/night-market/700/900',
		alt: 'Night market steam under a single bulb',
		width: 700,
		height: 900,
		createdAt: '2024-04-06T21:03:00Z'
	}
];

/** Bao-shaped: app/env → payload versions, newest last. */
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
			return { token: `mock.${seq++}.${btoa(username).slice(0, 8)}` };
		},

		async listPosts({ status, q, tag, from, to, sort = 'newest' } = {}) {
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
			return posts
				.filter(
					(p) =>
						(!status || p.status === status) &&
						(!q || `${p.title} ${p.subtitle}`.toLowerCase().includes(q.toLowerCase())) &&
						// OR semantics on tags, mirroring the public list contract
						(!tag?.length || p.tags.some((t) => tag.includes(t))) &&
						// inclusive editorial-date window (ISO compares lexicographically)
						(!from || p.date >= from) &&
						(!to || p.date <= to)
				)
				.sort((a, b) => {
					if (sort === 'title') return a.title.localeCompare(b.title);
					return sort === 'oldest'
						? a.updatedAt.localeCompare(b.updatedAt)
						: b.updatedAt.localeCompare(a.updatedAt);
				})
				.map(sum);
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
				throw new AdminApiError(412, `conflict: expected rev ${rev}, current ${p.rev}`);
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

		async listPhotos() {
			return clone(photos);
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
				createdAt: now()
			};
			photos = [created, ...photos];
			return clone(created);
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
				throw new AdminApiError(412, `CAS failed: expected ${cas}, current ${current}`);
			const created: SecretPayload = {
				data: clone(data),
				createdTime: now(),
				version: current + 1,
				destroyed: false,
				deletionTime: null
			};
			list.push(created);
			return created.version;
		}
	};
}

/** Singleton for the session (module state = the "server process"). */
export const mockApi = createMockApi();
