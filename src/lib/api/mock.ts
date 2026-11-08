import { AdminApiError, type AdminApi } from './types.ts';
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
		updatedAt: now()
	};
	return [structuredClone(pub), structuredClone(draft)];
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

export function createMockApi(): AdminApi {
	let posts = seedPosts();
	let photos = clone(PHOTOS);
	const secrets: Record<string, SecretPayload[]> = structuredClone(SECRETS);
	let seq = 100;

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

		async listPosts({ status, q } = {}) {
			const sum = (p: PostDetailAdmin): PostSummaryAdmin => ({
				slug: p.slug,
				title: p.title,
				subtitle: p.subtitle,
				status: p.status,
				updatedAt: p.updatedAt,
				rev: p.rev
			});
			return posts
				.filter(
					(p) =>
						(!status || p.status === status) &&
						(!q || `${p.title} ${p.subtitle}`.toLowerCase().includes(q.toLowerCase()))
				)
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
			// the §2 unit of work, mocked: preview default + status flip. byte-stable
			// re-publish: same content ⇒ same derived fields, still a new rev-free op.
			if (!p.preview)
				p.preview =
					p.content
						.replace(/^#.*$/m, '')
						.trim()
						.split(/\n\s*\n/)[0] ?? '';
			p.status = 'published';
			p.rev += 1;
			p.updatedAt = now();
			return clone(p);
		},

		async unpublishPost(slug) {
			const p = find(slug);
			p.status = 'draft';
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
			const created: AdminPhoto = { id: `p${seq++}`, createdAt: now(), ...clone(p) };
			photos = [created, ...photos];
			return clone(created);
		},

		async listTags() {
			const counts = new Map<string, number>();
			for (const p of posts) {
				if (p.status !== 'published') continue; // counts = published corpus
				for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
			}
			return [...counts.entries()]
				.map(([name, posts]) => ({ name, posts }))
				.sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name));
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
