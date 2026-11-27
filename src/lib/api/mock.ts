import {
	AdminApiError,
	PHOTOS_PAGE_SIZE,
	POSTS_PAGE_SIZE,
	type AdminApi,
	type Paged
} from './types.ts';
import { slugify } from '../slug.ts';
import type {
	EstateRow,
	AdminPhoto,
	NotificationItem,
	NotificationPage,
	NotificationQuery,
	PostDetailAdmin,
	PostSummaryAdmin,
	SecretMeta,
	SecretPath,
	SecretPayload,
	TaskActivity,
	TaskComment,
	TaskCreateInput,
	TaskDetail,
	TaskInvite,
	TaskItem,
	TaskMember,
	TaskPatchInput,
	TaskPriority,
	TaskProject,
	TaskRole,
	TaskStats,
	TaskSubtask,
	TaskWorkspace
} from './types.ts';

/**
 * In-process mock of the AdminApi — the Phase A source of truth for the UI
 * contract. Shape fidelity notes: content keeps ```mermaid fences (Route B),
 * secrets mirror Bao's KV-v2 {data, metadata} payloads, writes are CAS-checked
 * exactly like lumen's §8/§9 will be. Photo uploads store the Blob undecoded —
 * the twin cannot probe dimensions (placeholder dims stand in); lumen's
 * server-side probe is the only truth.
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
		exif: {
			takenAt: '2024-04-01T05:39:00Z',
			camera: 'Fujifilm X100VI',
			lens: '23mm f2',
			shutter: '1/250',
			iso: 640,
			aperture: 2.8
		},
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
		exif: null, // pre-capture era: the panel's honest empty state
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
		exif: null,
		gallery: true,
		collection: null, // in the Gallery, yet uncategorized
		createdAt: '2024-06-11T04:20:00Z'
	}
];

/** Collection vocabulary — admin-internal curation groups (owner decision
 *  2026-11-08: the blog ignores them; public = gallery=true, all themes). */
const COLLECTIONS = ['landscapes', 'street'];

/** Bao-shaped: app/env → payload versions, newest last. THREE apps ship in
 *  the twin (lumen + earendil + mellon) — "apps are DATA" was the corpus
 *  before it was the API (PLAN-SECRETS-CONTROL §2.2-1). Unified-vault round
 *  (lumen role split, 2026-11-13): lumen carries shared + staging AND
 *  production rows side by side — shared holds the cluster-wide values
 *  every env reads through; the mellon rows mirror the dual-upstream wiring
 *  (same image, two envs: ADMIN_URL shared, CMS_URL per env). */
const APP_SLUG = /^[a-z][a-z0-9-]{1,31}$/;
const ENV_SLUG = /^[a-z][a-z0-9-]{0,31}$/;
const DEFAULT_ENVS = ['dev', 'staging', 'production'];
/** pin write-lock per app/env (D1, redefined 2026-11-13: pin is a LOCK —
 *  pinned path refuses CAS writes until unpin). Absence is the honest unpinned. */
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
	'lumen/production': [
		{
			data: {
				API_BASE: 'http://lumen-http-server.lumen.svc.cluster.local',
				DB_HOST: 'lumen-pg-postgres.db.svc.cluster.local',
				DB_USER: 'lumen_production',
				MEILI_URL: 'http://meilisearch.search.svc.cluster.local:7700'
			},
			createdTime: '2026-11-12T09:40:00Z',
			version: 1,
			destroyed: false,
			deletionTime: null
		}
	],
	// the unified-vault shared path: cluster-wide values every env reads
	// through — the driftcheck sweep feeds it to the matrix like any other
	// app/env row (the ↓ marker is the shape trailing its widest sibling)
	'lumen/shared': [
		{
			data: {
				DB_HOST: 'lumen-pg-postgres.db.svc.cluster.local',
				MEILI_URL: 'http://meilisearch.search.svc.cluster.local:7700'
			},
			createdTime: '2026-11-12T09:30:00Z',
			version: 1,
			destroyed: false,
			deletionTime: null
		}
	],
	// mellon's own wiring, vault-side (dual-upstream round): the SAME image
	// runs both portals — ADMIN_URL is estate-wide (shared), CMS_URL is
	// per-env truth. ES reads both paths; nothing here leaves GitOps.
	'mellon/shared': [
		{
			data: {
				ADMIN_URL: 'http://lumen-admin.lumen.svc.cluster.local'
			},
			createdTime: '2026-11-13T06:00:00Z',
			version: 1,
			destroyed: false,
			deletionTime: null
		}
	],
	'mellon/staging': [
		{
			data: {
				CMS_URL: 'http://lumen-staging.lumen.svc.cluster.local'
			},
			createdTime: '2026-11-13T06:05:00Z',
			version: 1,
			destroyed: false,
			deletionTime: null
		}
	],
	'mellon/production': [
		{
			data: {
				CMS_URL: 'http://lumen-http-server.lumen.svc.cluster.local'
			},
			createdTime: '2026-11-13T06:10:00Z',
			version: 1,
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
 * The tasks twin's calendar helpers. Lumen computes "today"/"this week" from
 * the X-Client-Timezone header; the twin mirrors that with Intl (no new
 * dependency) by comparing LOCAL DAY KEYS — the same calendar boundaries
 * lumen's dayBounds/mondayStart draw, without carrying instants across DST.
 */
interface ZoneParts {
	year: number;
	month: number;
	day: number;
	weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** An unknown/empty IANA name falls back to UTC, lumen's rule (C5). */
function safeZone(timeZone?: string): string {
	if (!timeZone) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
		return timeZone;
	} catch {
		return 'UTC';
	}
}

function zoneParts(ms: number, timeZone: string): ZoneParts {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date(ms));
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return {
		year: Number(get('year')),
		month: Number(get('month')),
		day: Number(get('day')),
		weekday: WEEKDAYS.indexOf(get('weekday'))
	};
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function zoneDayKey(ms: number, timeZone: string): string {
	const p = zoneParts(ms, timeZone);
	return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** The Monday-start local week's first day, as a comparable day key. */
function mondayKey(ms: number, timeZone: string): string {
	const p = zoneParts(ms, timeZone);
	const shift = p.weekday === 0 ? 6 : p.weekday - 1; // Sunday closes the week
	const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - shift));
	return `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`;
}

/** The tasks service escapes interpolated names into the notification's
 *  sanitized-HTML body; titles stay plain text (lumen's split). */
function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function utf8Length(value: string): number {
	return new TextEncoder().encode(value).length;
}

/** The twin's stored rows — wire shapes plus the flags lumen keeps private
 *  (deleted_at, the membership roster) so live reads can filter honestly. */
interface TwinTaskProject {
	id: string;
	name: string;
	creatorId: string | null;
	completedAt: string | null;
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
	members: TaskMember[];
}

interface TwinTask {
	id: string;
	projectId: string;
	creatorId: string | null;
	assignedTo: string | null;
	title: string;
	notes: string;
	priority: TaskPriority;
	dueAt: string | null;
	done: boolean;
	doneAt: string | null;
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

interface TwinSubtask {
	id: string;
	taskId: string;
	title: string;
	done: boolean;
	createdAt: string;
}

interface TwinComment {
	id: string;
	taskId: string;
	authorId: string | null;
	body: string;
	createdAt: string;
}

interface TwinActivity {
	id: number;
	taskId: string;
	actorId: string | null;
	verb: string;
	detail: string;
	createdAt: string;
}

interface TwinInvite {
	id: string;
	projectId: string;
	inviterId: string;
	inviteeId: string;
	expiresAt: string;
	createdAt: string;
}

interface TwinNotification {
	id: string;
	userId: string;
	app: string;
	type: string;
	title: string;
	body: string;
	payload: Record<string, unknown>;
	readAt: string | null;
	expiresAt: string;
	createdAt: string;
}

export interface MockOptions {
	/** TEST SEAM: the tasks/notifications principal (defaults to 'admin'). */
	actor?: string;
	/** TEST SEAM: the clock in epoch ms (defaults to Date.now) — lets the
	 *  suite walk the invite TTL and the notification expiry without waiting. */
	now?: () => number;
}

/** The test-only twin surface: the AdminApi plus the identity switch the
 *  two-user walk needs (lumen resolves the caller from the bearer; the twin
 *  has no bearer, so tests say who is acting). Never part of AdminApi. */
export interface MockApi extends AdminApi {
	/** TEST-ONLY: the same in-memory state, acting as another user. */
	as(username: string): AdminApi;
}

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
 * Mock-era media bytes: id → Blob. Module-level (the relay route reads it
 * outside the API object) — the same process-lifetime singleton as the
 * fixtures. Phase B replaces this whole path: bytes live in object storage,
 * `src` is the CDN URL, and mellon serves nothing.
 */
export const mediaStore = new Map<string, Blob>();

export function createMockApi(options: MockOptions = {}): MockApi {
	let posts = seedPosts();
	let photos = clone(PHOTOS);
	const secrets: Record<string, SecretPayload[]> = structuredClone(SECRETS);
	let seq = 100;
	// wizard/user state — EMPTY start: the twin begins as an unclaimed estate,
	// so a fresh createMockApi() exercises exactly the sequence lumen's scratch
	// schema runs in TestSetupWizardE2E (per-instance state IS the reset button)
	const users = new Map<
		string,
		{
			id: string;
			name: string;
			email: string;
			scopes: string[];
			mustChange: boolean;
			disabled: boolean;
			createdAt: string;
		}
	>();
	// the PORTAL-MANAGED catalog (the spine ruling: onboarding a scope is a
	// portal action) — seeded exactly like lumen's migration
	const catalog = new Map<string, string>([
		['content:manage', 'the content desks: posts, photos, tags, collections, media'],
		['secrets:admin', 'the whole Bao cockpit: values, pins, app onboarding, the estate matrix'],
		['users:manage', 'user creation, scope assignment, the scope catalog, password resets'],
		['settings:manage', 'portal-level settings (reserved; gated when settings grow)']
	]);
	const uid = () => `u-${(seq++).toString(36)}-${btoa(usernameSeed()).slice(0, 6)}`;
	let userSeq = 0;
	const usernameSeed = () => `user-${userSeq++}`;
	const today = () => new Date().toISOString().slice(0, 10);
	const TW = ['malu', 'rore', 'tade', 'pagi', 'kino', 'vela', 'dumi', 'saro'];

	// Tag vocabulary — first-class, seeded from the corpus. A tag exists from
	// creation, used or not; posts may only carry vocabulary names (lumen §8
	// enforces the same; the UI never offers a non-vocab tag). Names key a
	// stamp row (tag-desk round): fixture seeds get stable timestamps derived
	// from creation order; live creates get `now()`.
	const vocab = new Map<string, { createdAt: string; updatedAt: string }>();
	const FIXTURE_T0 = Date.parse('2024-01-06T00:00:00Z');
	let fixtureSeq = 0;
	const fixtureStamp = () => {
		const iso = new Date(FIXTURE_T0 + fixtureSeq++ * 3_600_000).toISOString();
		return { createdAt: iso, updatedAt: iso };
	};
	for (const p of posts) for (const t of p.tags) if (!vocab.has(t)) vocab.set(t, fixtureStamp());
	// The desk's manual promotion set (lumen 0005 `featured`; seeded cloud
	// tags mirror the corpus's curated widget). Deletion frees membership.
	const featuredVocab = new Set<string>();
	for (const p of posts)
		if (p.status === 'published') for (const t of p.tags.slice(0, 2)) featuredVocab.add(t);
	// Collection vocabulary — same eager-creation semantics as tags.
	const collections = new Set<string>(COLLECTIONS);

	const find = (slug: string) => {
		const p = posts.find((x) => x.slug === slug);
		if (!p) throw new AdminApiError(404, `post not found: ${slug}`);
		return p;
	};
	const secretKey = (app: string, env: string) => `${app}/${env}`;
	// The ONE TagCount compiler for the twin: published-corpus counts +
	// featured membership + the vocabulary stamp. Every tag verb routes
	// through it so rows never drift shape between endpoints.
	const tagRow = (name: string) => {
		const stamp = vocab.get(name)!;
		return {
			name,
			posts: posts.filter((p) => p.status === 'published' && p.tags.includes(name)).length,
			featured: featuredVocab.has(name),
			createdAt: stamp.createdAt,
			updatedAt: stamp.updatedAt
		};
	};

	// ---- the tasks + notifications twin (M4.C) ----
	// A coherent two-user workspace, mirroring lumen's M2 semantics: TWO
	// identities (the default caller 'admin', the invitee 'sarah'), ONE
	// seeded project ("Home") with the caller as admin, ONE pending invite,
	// THREE tasks (due today, overdue, done) and the bell's rows. The tasks
	// directory is deliberately separate from the auth `users` map so a
	// fresh twin still starts as an UNCLAIMED estate (the setup-wizard
	// tests pin that); auth-created users fold in on first reference.
	const DAY = 86_400_000;
	const clock = options.now ?? (() => Date.now());
	const tnow = () => new Date(clock()).toISOString();
	const identities = new Map<string, { id: string; username: string }>([
		['admin', { id: 'twin-admin', username: 'admin' }],
		['sarah', { id: 'twin-sarah', username: 'sarah' }]
	]);
	const identityFor = (username: string): { id: string; username: string } => {
		const seeded = identities.get(username);
		if (seeded) return seeded;
		const authUser = users.get(username);
		if (!authUser) throw new AdminApiError(404, `no such user: ${username}`);
		const identity = { id: authUser.id, username };
		identities.set(username, identity);
		return identity;
	};
	const identityById = (id: string): { id: string; username: string } | undefined => {
		for (const identity of identities.values()) if (identity.id === id) return identity;
		for (const [username, row] of users) {
			if (row.id === id) {
				const identity = { id, username };
				identities.set(username, identity);
				return identity;
			}
		}
		return undefined;
	};
	const usernameOf = (id: string | null): string | null =>
		id ? (identityById(id)?.username ?? null) : null;

	const seededAt = clock();
	const at = (offsetMs: number) => new Date(seededAt + offsetMs).toISOString();
	/** The seed's due dates are UTC-hour anchored so the "today"/"overdue"
	 *  cards are meaningful at first boot (tests pin the clock + UTC zone). */
	const atUtc = (dayOffset: number, hour: number) => {
		const date = new Date(seededAt);
		date.setUTCHours(hour, 0, 0, 0);
		date.setUTCDate(date.getUTCDate() + dayOffset);
		return date.toISOString();
	};

	const home: TwinTaskProject = {
		id: 'twin-project-home',
		name: 'Home',
		creatorId: 'twin-admin',
		completedAt: null,
		deletedAt: null,
		createdAt: at(-30 * DAY),
		updatedAt: at(-2 * 3_600_000),
		members: [
			{
				userId: 'twin-admin',
				username: 'admin',
				role: 'admin',
				invitedBy: null,
				joinedAt: at(-30 * DAY)
			}
		]
	};
	const taskProjects: TwinTaskProject[] = [home];
	const taskItems: TwinTask[] = [
		{
			id: 'twin-task-gate',
			projectId: home.id,
			creatorId: 'twin-admin',
			assignedTo: 'twin-admin',
			title: 'Fix the gate',
			notes: '',
			priority: 'high',
			dueAt: atUtc(0, 17),
			done: false,
			doneAt: null,
			deletedAt: null,
			createdAt: at(-3 * DAY),
			updatedAt: at(-3 * 3_600_000)
		},
		{
			id: 'twin-task-paint',
			projectId: home.id,
			creatorId: 'twin-admin',
			assignedTo: null,
			title: 'Buy paint',
			notes: '',
			priority: 'medium',
			dueAt: atUtc(-1, 9),
			done: false,
			doneAt: null,
			deletedAt: null,
			createdAt: at(-2 * DAY),
			updatedAt: at(-2 * DAY)
		},
		{
			id: 'twin-task-plants',
			projectId: home.id,
			creatorId: 'twin-admin',
			assignedTo: 'twin-admin',
			title: 'Water the plants',
			notes: '',
			priority: 'none',
			dueAt: null,
			done: true,
			doneAt: at(-3_600_000),
			deletedAt: null,
			createdAt: at(-5 * DAY),
			updatedAt: at(-3_600_000)
		}
	];
	let taskSubtasks: TwinSubtask[] = [];
	let taskComments: TwinComment[] = [];
	let activitySeq = 1;
	const seedActivity = (taskId: string, verb: string, detail: string, offsetMs: number) => ({
		id: activitySeq++,
		taskId,
		actorId: 'twin-admin',
		verb,
		detail,
		createdAt: at(offsetMs)
	});
	const taskActivityLog: TwinActivity[] = [
		seedActivity('twin-task-gate', 'created', '', -3 * DAY),
		seedActivity('twin-task-gate', 'assigned', 'admin', -3 * DAY + 60_000),
		seedActivity('twin-task-paint', 'created', '', -2 * DAY),
		seedActivity('twin-task-plants', 'created', '', -5 * DAY),
		seedActivity('twin-task-plants', 'assigned', 'admin', -5 * DAY + 60_000),
		seedActivity('twin-task-plants', 'completed', '', -3_600_000)
	];
	let taskInvites: TwinInvite[] = [
		{
			id: 'twin-invite-sarah',
			projectId: home.id,
			inviterId: 'twin-admin',
			inviteeId: 'twin-sarah',
			expiresAt: at(24 * 3_600_000),
			createdAt: at(-3_600_000)
		}
	];
	const notificationRows: TwinNotification[] = [
		{
			id: 'twin-notification-assigned',
			userId: 'twin-admin',
			app: 'tasks',
			type: 'task.assigned',
			title: '📋 Fix the gate',
			body: 'Fix the gate in Home',
			payload: { url: '/tasks?task=twin-task-gate', task: 'twin-task-gate' },
			readAt: null,
			expiresAt: at(30 * DAY),
			createdAt: at(-20 * 60_000)
		},
		{
			id: 'twin-notification-content',
			userId: 'twin-admin',
			app: 'content',
			type: 'content.published',
			title: '📝 New post',
			body: '<b>Hello</b> is live.',
			payload: { url: '/posts/hello' },
			readAt: at(-2 * DAY + 3_600_000),
			expiresAt: at(30 * DAY),
			createdAt: at(-2 * DAY)
		},
		{
			id: 'twin-notification-invite',
			userId: 'twin-sarah',
			app: 'tasks',
			type: 'project.invite',
			title: "📦 You've been invited to Home",
			body: '<b>admin</b> invited you to collaborate — open Tasks to accept.',
			payload: { url: '/tasks', invite: 'twin-invite-sarah' },
			readAt: null,
			expiresAt: at(24 * 3_600_000),
			createdAt: at(-3_600_000)
		}
	];
	let taskSeq = 100;

	// The wire compilers — every verb routes through these so a row's shape
	// can never drift between the workspace, the drawer and the roster.
	const projectRow = (project: TwinTaskProject, role: TaskRole): TaskProject => {
		const live = taskItems.filter((task) => task.projectId === project.id && !task.deletedAt);
		return {
			id: project.id,
			name: project.name,
			role,
			creatorId: project.creatorId,
			completedAt: project.completedAt,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			taskCount: live.length,
			openCount: live.filter((task) => !task.done).length
		};
	};
	const taskRow = (task: TwinTask): TaskItem => {
		const project = taskProjects.find((p) => p.id === task.projectId)!;
		const subtasks = taskSubtasks.filter((subtask) => subtask.taskId === task.id);
		return {
			id: task.id,
			projectId: task.projectId,
			projectName: project.name,
			creatorId: task.creatorId,
			creatorName: usernameOf(task.creatorId),
			assignedTo: task.assignedTo,
			assigneeName: usernameOf(task.assignedTo),
			title: task.title,
			notes: task.notes,
			priority: task.priority,
			dueAt: task.dueAt,
			done: task.done,
			doneAt: task.doneAt,
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
			commentCount: taskComments.filter((comment) => comment.taskId === task.id).length,
			subtaskCount: subtasks.length,
			subtaskDone: subtasks.filter((subtask) => subtask.done).length
		};
	};
	const inviteRow = (invite: TwinInvite): TaskInvite => ({
		id: invite.id,
		projectId: invite.projectId,
		projectName: taskProjects.find((p) => p.id === invite.projectId)?.name ?? '',
		inviterId: invite.inviterId,
		inviterName: usernameOf(invite.inviterId) ?? '',
		inviteeId: invite.inviteeId,
		expiresAt: invite.expiresAt,
		createdAt: invite.createdAt
	});
	const notificationRow = (row: TwinNotification): NotificationItem => ({
		id: row.id,
		app: row.app,
		type: row.type,
		title: row.title,
		body: row.body,
		payload: clone(row.payload),
		readAt: row.readAt,
		expiresAt: row.expiresAt,
		createdAt: row.createdAt
	});
	const subtaskRow = (subtask: TwinSubtask): TaskSubtask => ({
		id: subtask.id,
		taskId: subtask.taskId,
		title: subtask.title,
		done: subtask.done,
		createdAt: subtask.createdAt
	});
	const commentRow = (comment: TwinComment): TaskComment => ({
		id: comment.id,
		taskId: comment.taskId,
		authorId: comment.authorId,
		authorName: usernameOf(comment.authorId),
		body: comment.body,
		createdAt: comment.createdAt
	});
	const activityRow = (activity: TwinActivity): TaskActivity => ({
		id: activity.id,
		taskId: activity.taskId,
		actorId: activity.actorId,
		actorName: usernameOf(activity.actorId),
		verb: activity.verb,
		detail: activity.detail,
		createdAt: activity.createdAt
	});
	const writeActivity = (taskId: string, actorId: string | null, verb: string, detail: string) => {
		taskActivityLog.push({
			id: activitySeq++,
			taskId,
			actorId,
			verb,
			detail,
			createdAt: tnow()
		});
	};
	const notify = (
		userId: string,
		input: {
			app: string;
			type: string;
			title: string;
			body: string;
			payload: Record<string, unknown>;
			expiresAt?: string;
		}
	) => {
		notificationRows.push({
			id: `twin-notification-${taskSeq++}`,
			userId,
			app: input.app,
			type: input.type,
			title: input.title,
			body: input.body,
			payload: input.payload,
			readAt: null,
			expiresAt: input.expiresAt ?? new Date(clock() + 30 * DAY).toISOString(),
			createdAt: tnow()
		});
	};
	const notifyAssignment = (task: TwinTask) => {
		if (!task.assignedTo) return;
		const project = taskProjects.find((p) => p.id === task.projectId)!;
		notify(task.assignedTo, {
			app: 'tasks',
			type: 'task.assigned',
			title: `📋 ${task.title}`,
			body: `${escapeHtml(task.title)} in ${escapeHtml(project.name)}`,
			payload: { url: `/tasks?task=${task.id}`, task: task.id }
		});
	};
	const computeStats = (scoped: TwinTask[], timezone?: string): TaskStats => {
		const zone = safeZone(timezone);
		const now = clock();
		const today = zoneDayKey(now, zone);
		const monday = mondayKey(now, zone);
		const stats: TaskStats = { open: 0, dueToday: 0, completedWeek: 0, overdue: 0 };
		for (const task of scoped) {
			if (!task.done) {
				stats.open++;
				if (task.dueAt) {
					const due = zoneDayKey(Date.parse(task.dueAt), zone);
					if (due === today) stats.dueToday++;
					else if (due < today) stats.overdue++;
				}
			} else if (task.doneAt && zoneDayKey(Date.parse(task.doneAt), zone) >= monday) {
				stats.completedWeek++;
			}
		}
		return stats;
	};
	const trimmedName = (what: string, value: string, limit: number): string => {
		const trimmed = String(value ?? '').trim();
		if (!trimmed) throw new AdminApiError(400, `${what} is required`);
		if ([...trimmed].length > limit)
			throw new AdminApiError(400, `${what} must be at most ${limit} characters`);
		return trimmed;
	};
	const validateSize = (what: string, value: string, limit: number) => {
		if (utf8Length(value) > limit)
			throw new AdminApiError(400, `${what} must be at most ${limit} bytes`);
	};
	const validatePriority = (priority: string) => {
		if (!['high', 'medium', 'low', 'none'].includes(priority))
			throw new AdminApiError(400, 'priority must be high, medium, low or none');
	};
	const parseDueAt = (value: string | null | undefined): string | null => {
		if (value === undefined || value === null || value === '') return null;
		const parsed = Date.parse(value);
		if (!Number.isFinite(parsed))
			throw new AdminApiError(400, 'dueAt must be an RFC 3339 timestamp');
		return new Date(parsed).toISOString();
	};
	const sameInstant = (a: string | null, b: string | null): boolean => {
		if (a === null || b === null) return a === b;
		return Date.parse(a) === Date.parse(b);
	};

	// Every task verb resolves the actor through a project membership: the
	// twin's membership IS authorization, exactly like lumen's store. One
	// denial voice (404) for unknown/foreign/soft-deleted; 403 confirms the
	// room but denies the verb (a member trying an admin-only settings verb).
	const build = (actorUsername: string): AdminApi => {
		const actor = identityFor(actorUsername);

		const liveProjects = () =>
			taskProjects.filter(
				(project) => !project.deletedAt && project.members.some((m) => m.userId === actor.id)
			);
		const liveTasks = () => {
			const projectIDs = new Set(liveProjects().map((project) => project.id));
			return taskItems.filter((task) => !task.deletedAt && projectIDs.has(task.projectId));
		};
		const roleOf = (project: TwinTaskProject): TaskRole =>
			project.members.find((member) => member.userId === actor.id)!.role;
		const projectForActor = (projectID: string): TwinTaskProject => {
			const project = taskProjects.find((p) => p.id === projectID && !p.deletedAt);
			if (!project || !project.members.some((m) => m.userId === actor.id))
				throw new AdminApiError(404, 'not found');
			return project;
		};
		const requireProjectAdmin = (project: TwinTaskProject) => {
			if (roleOf(project) !== 'admin') throw new AdminApiError(403, 'forbidden');
		};
		const taskForActor = (taskID: string): TwinTask => {
			const task = taskItems.find((t) => t.id === taskID && !t.deletedAt);
			if (!task) throw new AdminApiError(404, 'not found');
			const project = taskProjects.find((p) => p.id === task.projectId && !p.deletedAt);
			if (!project || !project.members.some((m) => m.userId === actor.id))
				throw new AdminApiError(404, 'not found');
			return task;
		};

		return {
			async login(username, password) {
				if (!username || !password) throw new AdminApiError(401, 'credentials required');
				// mock accepts anything non-empty; lumen actually checks. scopes +
				// mustChange mirror the multi-user row semantics (the legacy
				// permissive login reads as a comfortable admin, as it has since
				// before users existed)
				const u = users.get(username);
				return {
					token: `mock.${seq++}.${btoa(username).slice(0, 8)}`,
					expiresIn: 60 * 60 * 12,
					scopes: u ? [...u.scopes] : [...catalog.keys()],
					mustChange: u?.mustChange ?? false,
					disabled: u?.disabled ?? false
				};
			},

			// ---- setup wizard + user administration (lumen mirror, 2026-11-11) ----
			async setupStatus() {
				return { unclaimed: users.size === 0 };
			},
			async registerFirstAdmin(username, password) {
				if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username))
					throw new AdminApiError(
						400,
						'username must be 2-32 chars: lowercase letters, digits, dot, dash, underscore'
					);
				if (password.length < 10)
					throw new AdminApiError(400, 'password must be at least 10 characters');
				if (users.size > 0) throw new AdminApiError(410, 'setup already completed');
				const id = uid();
				users.set(username, {
					id,
					name: username,
					email: '',
					scopes: [...catalog.keys()],
					mustChange: false,
					disabled: false,
					createdAt: today()
				});
				return {
					token: `mock.${seq++}.${btoa(username).slice(0, 8)}`,
					expiresIn: 60 * 60 * 12,
					scopes: [...catalog.keys()],
					mustChange: false,
					disabled: false
				};
			},
			async whoami() {
				// the twin has no bearer plumbing; first admin answers, as the
				// server would for the account the wizard just minted for
				const [username, u] = [...users.entries()][0] ?? [];
				if (!username) throw new AdminApiError(401, 'unauthorized');
				return {
					username,
					id: u.id,
					scopes: [...u.scopes],
					mustChange: u.mustChange,
					disabled: u.disabled,
					name: u.name,
					email: u.email
				};
			},
			async profile() {
				const [username, u] = [...users.entries()][0] ?? [];
				if (!username) throw new AdminApiError(401, 'unauthorized');
				return {
					id: u.id,
					username,
					name: u.name,
					email: u.email,
					scopes: [...u.scopes],
					mustChange: u.mustChange,
					disabled: u.disabled,
					createdAt: u.createdAt
				};
			},
			async updateProfile(name, email) {
				const [username, u] = [...users.entries()][0] ?? [];
				if (!username) throw new AdminApiError(401, 'unauthorized');
				name = name.trim();
				if (!name || [...name].length > 80)
					throw new AdminApiError(400, 'display name must be 1-80 characters');
				const normalized = email.trim().toLowerCase();
				if (normalized) {
					if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
						throw new AdminApiError(400, 'enter a valid email address');
					for (const [other, row] of users) {
						if (other !== username && row.email === normalized)
							throw new AdminApiError(409, 'email already in use');
					}
				}
				u.name = name;
				u.email = normalized;
				return {
					id: u.id,
					username,
					name: u.name,
					email: u.email,
					scopes: [...u.scopes],
					mustChange: u.mustChange,
					disabled: u.disabled,
					createdAt: u.createdAt
				};
			},
			async changePassword(current, next) {
				if (!current) throw new AdminApiError(401, 'invalid credentials');
				if (next.length < 10)
					throw new AdminApiError(400, 'password must be at least 10 characters');
				if (current === next)
					throw new AdminApiError(400, 'the new password must differ from the current one');
				const who = [...users.keys()][0];
				const u = users.get(who);
				if (u) u.mustChange = false;
			},
			async listUsers() {
				return [...users.entries()].map(([username, u]) => ({
					...u,
					username,
					scopes: [...u.scopes]
				}));
			},
			async createUser(username, granted) {
				if (users.has(username)) throw new AdminApiError(409, 'username taken');
				if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username))
					throw new AdminApiError(
						400,
						'username must be 2-32 chars: lowercase letters, digits, dot, dash, underscore'
					);
				// the catalog is the assignable vocabulary — the FK's twin
				for (const sc of granted) {
					if (!catalog.has(sc)) throw new AdminApiError(400, `unknown scope: ${sc}`);
				}
				// lumen GENERATES the temp server-side (syllable form, once in the
				// response); the twin forges the same shape without pretending to
				// the crypto entropy — what matters to callers is the contract
				const temp =
					Array.from({ length: 4 }, (_, i) => TW[(seq + i * 3) % TW.length]).join('-') +
					'-' +
					String(1000 + ((seq * 7919) % 9000));
				const id = uid();
				users.set(username, {
					id,
					name: username,
					email: '',
					scopes: [...granted],
					mustChange: true,
					disabled: false,
					createdAt: today()
				});
				return {
					username,
					id,
					name: username,
					email: '',
					scopes: [...granted],
					mustChange: true,
					disabled: false,
					createdAt: today(),
					tempPassword: temp
				};
			},
			async updateUserScopes(username, granted) {
				const u = users.get(username);
				if (!u) throw new AdminApiError(404, 'no such user');
				for (const sc of granted) {
					if (!catalog.has(sc)) throw new AdminApiError(400, `unknown scope: ${sc}`);
				}
				u.scopes = [...granted];
				return { username, scopes: [...u.scopes], tokenVersion: seq++ };
			},
			async revokeSessions(username) {
				const u = users.get(username);
				if (!u) throw new AdminApiError(404, 'no such user');
				// the revocation lever, mirrored (the twin has no real tokens to
				// kill — the bump is the contract, not the mechanism)
				return { username, scopes: [...u.scopes], tokenVersion: seq++ };
			},
			async forcePasswordChange(username) {
				const u = users.get(username);
				if (!u) throw new AdminApiError(404, 'no such user');
				u.mustChange = true;
				return { username, mustChange: true };
			},
			async setUserDisabled(username, disabled) {
				const u = users.get(username);
				if (!u) throw new AdminApiError(404, 'no such user');
				u.disabled = disabled;
				return { username, scopes: [...u.scopes], tokenVersion: disabled ? seq++ : 0 };
			},
			async deleteUser(username) {
				if (!users.delete(username)) throw new AdminApiError(404, 'no such user');
			},
			async listScopes() {
				return [...catalog.entries()].map(([scope, description]) => ({ scope, description }));
			},
			async addScope(scope, description) {
				if (!/^[a-z]+:[a-z]+$/.test(scope))
					throw new AdminApiError(400, 'scope must be <domain>:<verb>, lowercase');
				if (!description.trim())
					throw new AdminApiError(400, 'scope must be <domain>:<verb>, lowercase');
				catalog.set(scope, description);
				return { scope, description };
			},
			async deleteScope(scope) {
				const holders = [...users.values()].filter((u) => u.scopes.includes(scope)).length;
				if (holders > 0)
					throw new AdminApiError(
						409,
						`scope still assigned to ${holders} user(s) — unassign first`
					);
				if (!catalog.delete(scope)) throw new AdminApiError(404, 'no such scope');
			},
			async resetUserPassword(username) {
				const u = users.get(username);
				if (!u) throw new AdminApiError(404, 'no such user');
				u.mustChange = true;
				return { tempPassword: `reset-${seq++}-temp-word-0000` };
			},
			async logout() {
				// mock era: nothing verifies tokens, so there is nothing to revoke —
				// resolves; Phase B this bumps lumen's token_version for real
			},

			// ---- the passkey round (C1): the mock's in-memory passkey ----
			async authMethods() {
				return { methods: ['password', 'passkey'] };
			},
			async passkeyLoginBegin() {
				// a mock "challenge": the browser never parses it for truth —
				// the real ceremony is lumen's; the mock returns a stable shape
				return {
					state: 'mock-passkey-login-state',
					options: { publicKey: { challenge: 'bW9jaw', rpId: 'mock' } }
				};
			},
			async passkeyLoginFinish() {
				// the mock's roster has no WebAuthn rows — the ceremony is
				// lumen's; the mock grants the FIRST mock user if one exists
				const first = users.entries().next();
				if (first.done) throw new AdminApiError(401, 'invalid credentials');
				const [username, row] = first.value;
				return {
					token: `mock-passkey-token-${username}`,
					expiresIn: 3600,
					scopes: row.scopes,
					mustChange: row.mustChange,
					disabled: row.disabled
				};
			},
			async passkeyRegisterBegin() {
				return {
					state: 'mock-passkey-register-state',
					options: { publicKey: { challenge: 'bW9jaw', rpId: 'mock' } }
				};
			},
			async passkeyRegisterFinish(_state, label) {
				return {
					passkey: {
						id: `mock-passkey-${label || 'default'}`,
						label: label || 'passkey',
						createdAt: 'mock'
					}
				};
			},
			async passkeys() {
				return {
					passkeys: [
						{ id: 'mock-passkey-1', label: 'mock passkey', createdAt: 'mock', lastUsedAt: '' }
					]
				};
			},
			async passkeyDelete() {
				// the mock's roster is static; the real verb hits lumen's row
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
				// the relay's shape is a LIVE-transport verb: the twin has no upstream
				// to stream into, so a body arriving here is a routing bug
				if ('body' in p) throw new AdminApiError(501, 'stream forwarding is a relay concern');
				// bytes land verbatim (the Blob, undecoded) — the twin cannot probe
				// dimensions, so the placeholder dims stand in; lumen's decode is
				// the only truth the panel ever reads in real mode.
				// The exif field: the twin stores what the client captured — the
				// ALLOWLIST lives in lumen (the twin is the wire's SHAPE, not its
				// policy; the panel reads it identically either way).
				const id = `m${seq++}`;
				mediaStore.set(id, p.file);
				const created: AdminPhoto = {
					id,
					src: `/api/media/${id}`,
					alt: p.name.replace(/\.[^.]+$/, ''),
					width: 1600,
					height: 1200,
					exif: p.exif ?? null,
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
				// Every vocabulary name appears — unused tags at 0, `featured`
				// carried for the desk (the PUBLIC widget's posts>0 rule lives in
				// lumen's read; the desk shows the whole truth either way).
				return [...vocab.keys()]
					.map(tagRow)
					.sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name));
			},

			async listNewestTags() {
				// lumen `?order=newest`: created_at DESC, mirrors the wire shape 1:1.
				return [...vocab.keys()].map(tagRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			},

			async searchTags(qRaw, page, pageSize) {
				// The lumen engine is fuzzy; the twin approximates it case-insensitively:
				// prefix matches rank first, then contains matches, names stable-sorted
				// within each rank tier. total = full match count, honest paging.
				const needle = String(qRaw ?? '')
					.trim()
					.toLowerCase();
				const prefixes: string[] = [];
				const contains: string[] = [];
				for (const name of vocab.keys()) {
					const k = name.toLowerCase();
					if (k.startsWith(needle)) prefixes.push(name);
					else if (k.includes(needle)) contains.push(name);
				}
				const byName = (a: string, b: string) => a.localeCompare(b);
				const ranked = [...prefixes.sort(byName), ...contains.sort(byName)].map(tagRow);
				return paged(ranked, page ?? 1, pageSize ?? 30);
			},

			async bulkFeatureTags(names, featured) {
				// One call promotes/un-promotes a SET; the number is rows that
				// ACTUALLY changed (unknown names move nothing, lumen counts them out).
				let updated = 0;
				for (const n of names) {
					const stamp = vocab.get(n);
					if (!stamp || featuredVocab.has(n) === featured) continue;
					if (featured) featuredVocab.add(n);
					else featuredVocab.delete(n);
					stamp.updatedAt = now();
					updated++;
				}
				return updated;
			},

			async createTag(raw) {
				const name = slugify(String(raw ?? '')).slice(0, 32);
				if (!name) throw new AdminApiError(400, 'tag name has no letters or digits');
				if (vocab.has(name)) throw new AdminApiError(409, `tag exists: ${name}`);
				const iso = now();
				vocab.set(name, { createdAt: iso, updatedAt: iso });
				return tagRow(name);
			},

			async updateTag(name, patch) {
				if (!vocab.has(name)) throw new AdminApiError(404, 'vocabulary row not found');
				let cur = name;
				const stamp = vocab.get(name)!;
				let dirty = false;
				if (patch.name !== undefined) {
					const next = slugify(String(patch.name)).slice(0, 32);
					if (!next) throw new AdminApiError(400, 'tag name has no letters or digits');
					if (next !== cur && vocab.has(next)) throw new AdminApiError(409, `tag exists: ${next}`);
					if (next !== cur) {
						// rename PROPAGATES (id-keyed FKs in lumen; here: rewrite the tag lists)
						for (const p of posts) p.tags = p.tags.map((t) => (t === cur ? next : t));
						vocab.delete(cur);
						if (featuredVocab.delete(cur)) featuredVocab.add(next);
						vocab.set(next, stamp); // the stamp survives the rename
						cur = next;
						dirty = true;
					}
				}
				if (patch.featured !== undefined) {
					if (featuredVocab.has(cur) !== patch.featured) dirty = true;
					if (patch.featured) featuredVocab.add(cur);
					else featuredVocab.delete(cur);
				}
				if (dirty) stamp.updatedAt = now();
				return tagRow(cur);
			},

			async deleteTag(name) {
				if (!vocab.has(name)) throw new AdminApiError(404, 'vocabulary row not found');
				const used = posts.filter((p) => p.tags.includes(name)).length;
				if (used > 0)
					throw new AdminApiError(409, `tag is in use — ${used} posts still reference it`);
				vocab.delete(name);
				featuredVocab.delete(name);
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
				const tagHits = [...vocab.keys()]
					.filter((t) => t.startsWith(q))
					.sort()
					.slice(0, 8)
					.map(tagRow); // same counting rule as listTags: published corpus
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
				// PIN WRITE-LOCK (lumen 230783b — "pin is a lock"): a pinned path
				// refuses CAS writes BEFORE anything else, and the copy below is
				// WIRE CONTRACT TEXT asserted at byte level on the lumen side —
				// the twin mirrors it verbatim. A refused save writes NOTHING:
				// no bump here, no mirror fan-out.
				const pinned = PINNED[key];
				if (pinned !== undefined)
					throw new AdminApiError(403, `pinned at v${pinned} — unpin first`);
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
			},

			async estateSummary(): Promise<EstateRow[]> {
				return Object.keys(secrets).map((k) => {
					const [app, env] = k.split('/');
					const head = secrets[k].at(-1)!;
					return {
						app,
						env,
						version: head.version,
						pinnedVersion: PINNED[k] ?? null,
						keys: Object.keys(head.data).length,
						emptyKeys: Object.values(head.data).filter((v) => v === '').length
					};
				});
			},

			// ---- tasks workspace (lumen internal/tasks, M2 semantics) ----
			async tasksWorkspace({ view, projectId, timezone }) {
				if (view !== 'today' && view !== 'upcoming' && view !== 'all')
					throw new AdminApiError(400, 'view must be today, upcoming or all');

				const projects = liveProjects().map((project) => projectRow(project, roleOf(project)));
				// The project filter is itself membership-checked (a foreign id is
				// not-found, never an empty list) and narrows the TASKS only:
				// lumen computes the cards over the whole membership.
				let scoped = liveTasks();
				if (projectId) {
					const project = projectForActor(projectId);
					scoped = scoped.filter((task) => task.projectId === project.id);
				}

				const today = zoneDayKey(clock(), safeZone(timezone));
				const filtered = scoped.filter((task) => {
					if (view === 'all') return true;
					if (!task.dueAt) return false;
					const due = zoneDayKey(Date.parse(task.dueAt), safeZone(timezone));
					if (view === 'upcoming') return due > today;
					// today: due inside the local day, OR overdue while still open
					// (a done task due in the past must not flood "My day").
					return due === today || (!task.done && due < today);
				});
				filtered.sort(
					(a, b) =>
						(a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
						a.createdAt.localeCompare(b.createdAt) ||
						a.id.localeCompare(b.id)
				);
				return {
					projects,
					tasks: filtered.map(taskRow),
					stats: computeStats(liveTasks(), timezone)
				} satisfies TaskWorkspace;
			},

			async taskStats(timezone) {
				return computeStats(liveTasks(), timezone);
			},

			async taskProjectCreate(name) {
				const created: TwinTaskProject = {
					id: `twin-project-${taskSeq++}`,
					name: trimmedName('name', name, 100),
					creatorId: actor.id,
					completedAt: null,
					deletedAt: null,
					createdAt: tnow(),
					updatedAt: tnow(),
					members: [
						{
							userId: actor.id,
							username: actor.username,
							role: 'admin',
							invitedBy: null,
							joinedAt: tnow()
						}
					]
				};
				taskProjects.push(created);
				return projectRow(created, 'admin');
			},

			async taskProjectRename(id, name) {
				const project = projectForActor(id);
				requireProjectAdmin(project);
				project.name = trimmedName('name', name, 100);
				project.updatedAt = tnow();
			},

			async taskProjectComplete(id, completed) {
				const project = projectForActor(id);
				requireProjectAdmin(project);
				// COALESCE on the way in: repeated completes keep the ORIGINAL
				// instant; `false` reopens (clears the flag).
				project.completedAt = completed ? (project.completedAt ?? tnow()) : null;
				project.updatedAt = tnow();
				return completed;
			},

			async taskProjectDelete(id) {
				const project = projectForActor(id);
				requireProjectAdmin(project);
				// SOFT delete (C4): every live read filters the flag.
				project.deletedAt = tnow();
				project.updatedAt = tnow();
			},

			async taskMembers(id) {
				const project = projectForActor(id);
				return [...project.members]
					.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId))
					.map((member) => ({ ...member }));
			},

			async taskMemberRole(id, userId, role) {
				const project = projectForActor(id);
				requireProjectAdmin(project);
				if (role !== 'admin' && role !== 'member')
					throw new AdminApiError(400, 'role must be admin or member');
				const target = project.members.find((member) => member.userId === userId);
				if (!target) throw new AdminApiError(404, 'not found');
				if (target.role === role) return;
				if (target.role === 'admin' && role === 'member') {
					const admins = project.members.filter((member) => member.role === 'admin').length;
					// A project must always keep one admin (C2) — 409, the same
					// invariant the last-admin removal carries.
					if (admins <= 1) throw new AdminApiError(409, 'conflict');
				}
				target.role = role;
			},

			async taskMemberRemove(id, userId) {
				const project = projectForActor(id);
				requireProjectAdmin(project);
				const target = project.members.find((member) => member.userId === userId);
				if (!target) throw new AdminApiError(404, 'not found');
				if (target.role === 'admin') {
					const admins = project.members.filter((member) => member.role === 'admin').length;
					if (admins <= 1) throw new AdminApiError(409, 'conflict');
				}
				project.members = project.members.filter((member) => member.userId !== userId);
				// Removal UNASSIGNS that member's tasks in this project in the
				// same transaction — an assignee is always a member (C3).
				for (const task of taskItems) {
					if (task.projectId === project.id && task.assignedTo === userId) {
						task.assignedTo = null;
						task.updatedAt = tnow();
					}
				}
			},

			async taskInviteCreate(projectId, username) {
				const project = projectForActor(projectId);
				requireProjectAdmin(project);
				const inviteeName = String(username ?? '').trim();
				if (!inviteeName) throw new AdminApiError(400, 'username is required');
				let invitee: { id: string; username: string };
				try {
					invitee = identityFor(inviteeName);
				} catch {
					// A mistyped invitee is the caller's copy being wrong (400),
					// not a hidden estate resource (lumen maps its 404 here).
					throw new AdminApiError(400, `unknown username "${inviteeName}"`);
				}
				if (project.members.some((member) => member.userId === invitee.id))
					throw new AdminApiError(409, 'already a member');
				if (
					taskInvites.some(
						(invite) => invite.projectId === project.id && invite.inviteeId === invitee.id
					)
				)
					// The pending-invite unique index is the backstop; expired rows
					// stay until consumed (no purge), so they block a re-invite too.
					throw new AdminApiError(409, 'a pending invite already exists');
				const created: TwinInvite = {
					id: `twin-invite-${taskSeq++}`,
					projectId: project.id,
					inviterId: actor.id,
					inviteeId: invitee.id,
					expiresAt: new Date(clock() + 24 * 3_600_000).toISOString(),
					createdAt: tnow()
				};
				taskInvites.push(created);
				notify(invitee.id, {
					app: 'tasks',
					type: 'project.invite',
					title: `📦 You've been invited to ${project.name}`,
					body: `<b>${escapeHtml(actor.username)}</b> invited you to collaborate — open Tasks to accept.`,
					payload: { url: '/tasks', invite: created.id },
					expiresAt: created.expiresAt
				});
				return inviteRow(created);
			},

			async taskInvites() {
				const now = clock();
				return taskInvites
					.filter(
						(invite) =>
							invite.inviteeId === actor.id &&
							Date.parse(invite.expiresAt) > now &&
							taskProjects.some((p) => p.id === invite.projectId && !p.deletedAt)
					)
					.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
					.map(inviteRow);
			},

			async taskInviteAccept(id) {
				const invite = taskInvites.find((row) => row.id === id && row.inviteeId === actor.id);
				if (!invite) throw new AdminApiError(404, 'not found');
				const project = taskProjects.find((p) => p.id === invite.projectId);
				if (!project || project.deletedAt) {
					taskInvites = taskInvites.filter((row) => row.id !== invite.id);
					throw new AdminApiError(404, 'not found');
				}
				// The expiry is FINAL: the row is consumed on the way out, so the
				// retry is a plain 404 and no purge job is needed.
				if (Date.parse(invite.expiresAt) <= clock()) {
					taskInvites = taskInvites.filter((row) => row.id !== invite.id);
					throw new AdminApiError(410, 'this invite expired — ask to be re-invited');
				}
				taskInvites = taskInvites.filter((row) => row.id !== invite.id);
				if (!project.members.some((member) => member.userId === actor.id)) {
					project.members.push({
						userId: actor.id,
						username: actor.username,
						role: 'member',
						invitedBy: invite.inviterId,
						joinedAt: tnow()
					});
				}
				return inviteRow(invite);
			},

			async taskInviteDecline(id) {
				const before = taskInvites.length;
				taskInvites = taskInvites.filter(
					(invite) => !(invite.id === id && invite.inviteeId === actor.id)
				);
				if (taskInvites.length === before) throw new AdminApiError(404, 'not found');
			},

			async taskInviteRevoke(projectId, inviteId) {
				const project = projectForActor(projectId);
				requireProjectAdmin(project);
				const before = taskInvites.length;
				taskInvites = taskInvites.filter(
					(invite) => !(invite.id === inviteId && invite.projectId === project.id)
				);
				if (taskInvites.length === before) throw new AdminApiError(404, 'not found');
			},

			async taskCreate(input: TaskCreateInput) {
				const project = projectForActor(input.projectId);
				const title = trimmedName('title', input.title, 200);
				const notes = input.notes ?? '';
				validateSize('notes', notes, 16 * 1024);
				const priority = input.priority ?? 'none';
				validatePriority(priority);
				const dueAt = parseDueAt(input.dueAt);
				if (input.assignedTo !== undefined && input.assignedTo !== null && !input.assignedTo.trim())
					throw new AdminApiError(400, 'assignedTo must be a user id or null');
				let assigneeName: string | null = null;
				if (input.assignedTo) {
					const member = project.members.find((m) => m.userId === input.assignedTo);
					if (!member) throw new AdminApiError(409, 'the assignee must be a project member');
					assigneeName = member.username;
				}
				const created: TwinTask = {
					id: `twin-task-${taskSeq++}`,
					projectId: project.id,
					creatorId: actor.id,
					assignedTo: input.assignedTo ?? null,
					title,
					notes,
					priority,
					dueAt,
					done: false,
					doneAt: null,
					deletedAt: null,
					createdAt: tnow(),
					updatedAt: tnow()
				};
				taskItems.push(created);
				writeActivity(created.id, actor.id, 'created', '');
				if (created.assignedTo) {
					writeActivity(created.id, actor.id, 'assigned', assigneeName ?? '');
					if (created.assignedTo !== actor.id) notifyAssignment(created);
				}
				return taskRow(created);
			},

			async taskGet(id) {
				const task = taskForActor(id);
				return {
					task: taskRow(task),
					subtasks: taskSubtasks
						.filter((subtask) => subtask.taskId === task.id)
						.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
						.map(subtaskRow),
					comments: taskComments
						.filter((comment) => comment.taskId === task.id)
						.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
						.map(commentRow),
					activity: taskActivityLog
						.filter((activity) => activity.taskId === task.id)
						.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
						.map(activityRow)
				} satisfies TaskDetail;
			},

			async taskUpdate(id, patch: TaskPatchInput) {
				const task = taskForActor(id);
				const project = taskProjects.find((p) => p.id === task.projectId)!;

				// Validate and stage EVERY present field before writing any (a
				// rejected assignee must not leave a half-applied title).
				let nextTitle = task.title;
				let nextNotes = task.notes;
				let nextPriority = task.priority;
				let nextDueAt = task.dueAt;
				if (patch.title !== undefined) nextTitle = trimmedName('title', patch.title, 200);
				if (patch.notes !== undefined) {
					nextNotes = patch.notes;
					validateSize('notes', nextNotes, 16 * 1024);
				}
				if (patch.priority !== undefined) {
					validatePriority(patch.priority);
					nextPriority = patch.priority;
				}
				if (patch.dueAt !== undefined) nextDueAt = parseDueAt(patch.dueAt);
				if (patch.assignedTo !== undefined && patch.assignedTo !== null && !patch.assignedTo.trim())
					throw new AdminApiError(400, 'assignedTo must be a user id or null');
				const assigneeChanged =
					patch.assignedTo !== undefined && patch.assignedTo !== task.assignedTo;
				let assigneeName: string | null = null;
				if (assigneeChanged && patch.assignedTo) {
					const member = project.members.find((m) => m.userId === patch.assignedTo);
					if (!member) throw new AdminApiError(409, 'the assignee must be a project member');
					assigneeName = member.username;
				}

				const changed: string[] = [];
				if (nextTitle !== task.title) changed.push('title');
				if (nextNotes !== task.notes) changed.push('notes');
				if (nextPriority !== task.priority) changed.push('priority');
				if (!sameInstant(nextDueAt, task.dueAt)) changed.push('dueAt');
				task.title = nextTitle;
				task.notes = nextNotes;
				task.priority = nextPriority;
				task.dueAt = nextDueAt;
				if (assigneeChanged) task.assignedTo = patch.assignedTo ?? null;
				task.updatedAt = tnow();
				if (changed.length) writeActivity(task.id, actor.id, 'updated', changed.join(', '));
				if (assigneeChanged)
					writeActivity(task.id, actor.id, 'assigned', assigneeName ?? 'unassigned');
				if (assigneeChanged && task.assignedTo && task.assignedTo !== actor.id)
					notifyAssignment(task);
				return taskRow(task);
			},

			async taskToggle(id) {
				const task = taskForActor(id);
				task.done = !task.done;
				task.doneAt = task.done ? tnow() : null;
				task.updatedAt = tnow();
				writeActivity(task.id, actor.id, task.done ? 'completed' : 'reopened', '');
				return taskRow(task);
			},

			async taskDelete(id) {
				const task = taskForActor(id);
				task.deletedAt = tnow();
				task.updatedAt = tnow();
				writeActivity(task.id, actor.id, 'deleted', '');
			},

			async taskSubtaskCreate(taskId, title) {
				const task = taskForActor(taskId);
				const created: TwinSubtask = {
					id: `twin-subtask-${taskSeq++}`,
					taskId: task.id,
					title: trimmedName('title', title, 200),
					done: false,
					createdAt: tnow()
				};
				taskSubtasks.push(created);
				return subtaskRow(created);
			},

			async taskSubtaskUpdate(taskId, subtaskId, patch) {
				taskForActor(taskId);
				const subtask = taskSubtasks.find((row) => row.id === subtaskId && row.taskId === taskId);
				if (!subtask) throw new AdminApiError(404, 'not found');
				if (patch.title !== undefined) subtask.title = trimmedName('title', patch.title, 200);
				if (patch.done !== undefined) subtask.done = patch.done;
				return subtaskRow(subtask);
			},

			async taskSubtaskDelete(taskId, subtaskId) {
				taskForActor(taskId);
				const before = taskSubtasks.length;
				taskSubtasks = taskSubtasks.filter(
					(row) => !(row.id === subtaskId && row.taskId === taskId)
				);
				if (taskSubtasks.length === before) throw new AdminApiError(404, 'not found');
			},

			async taskCommentCreate(taskId, body) {
				const task = taskForActor(taskId);
				const trimmed = String(body ?? '').trim();
				if (!trimmed) throw new AdminApiError(400, 'comment body is required');
				validateSize('comment body', trimmed, 8 * 1024);
				const created: TwinComment = {
					id: `twin-comment-${taskSeq++}`,
					taskId: task.id,
					authorId: actor.id,
					body: trimmed,
					createdAt: tnow()
				};
				taskComments.push(created);
				writeActivity(task.id, actor.id, 'commented', '');
				return commentRow(created);
			},

			async taskCommentDelete(taskId, commentId) {
				const task = taskForActor(taskId);
				const project = taskProjects.find((p) => p.id === task.projectId)!;
				const comment = taskComments.find((row) => row.id === commentId && row.taskId === task.id);
				if (!comment) throw new AdminApiError(404, 'not found');
				// The author-or-project-admin rule; a deleted author (null) can
				// only be cleaned up by an admin — history has no owner to defend it.
				if (comment.authorId !== actor.id && roleOf(project) !== 'admin')
					throw new AdminApiError(403, 'forbidden');
				taskComments = taskComments.filter((row) => row.id !== comment.id);
			},

			// ---- the bell (reads/marks only; the send door is not a portal verb) ----
			async notifications(query: NotificationQuery = {}) {
				const now = clock();
				// The first page's cursor is "now" — the twin's frozen clock makes
				// a row created in the SAME millisecond as the read equal to the
				// cutoff, so the inclusive-by-one-ms default keeps it visible
				// (lumen's request clock always lands after the committed row).
				let before = now + 1;
				if (query.before) {
					const parsed = Date.parse(query.before);
					if (!Number.isFinite(parsed))
						throw new AdminApiError(400, 'before must be an RFC 3339 timestamp');
					before = parsed;
				}
				let limit = query.limit ?? 20;
				if (!Number.isFinite(limit) || limit <= 0) limit = 20;
				if (limit > 100) limit = 100;
				const items = notificationRows
					.filter(
						(row) =>
							row.userId === actor.id &&
							Date.parse(row.expiresAt) > now &&
							Date.parse(row.createdAt) < before &&
							(query.unread !== true || row.readAt === null)
					)
					.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
					.slice(0, limit)
					.map(notificationRow);
				// Only a FULL page can have more behind it (lumen's cursor rule).
				const nextBefore = items.length === limit ? items[items.length - 1].createdAt : null;
				return { items, nextBefore } satisfies NotificationPage;
			},

			async notificationsUnreadCount() {
				const now = clock();
				return notificationRows.filter(
					(row) => row.userId === actor.id && row.readAt === null && Date.parse(row.expiresAt) > now
				).length;
			},

			async notificationMarkRead(id) {
				const row = notificationRows.find(
					(n) => n.id === id && n.userId === actor.id && Date.parse(n.expiresAt) > clock()
				);
				// Foreign, expired, unknown: the ONE denial (existence is not a signal).
				if (!row) throw new AdminApiError(404, 'not found');
				row.readAt = tnow(); // idempotent: a second call simply re-stamps
			},

			async notificationsMarkAllRead() {
				const now = clock();
				let updated = 0;
				for (const row of notificationRows) {
					if (row.userId === actor.id && row.readAt === null && Date.parse(row.expiresAt) > now) {
						row.readAt = tnow();
						updated++;
					}
				}
				return updated;
			}
		};
	};

	return Object.assign(build(options.actor ?? 'admin'), {
		as: (username: string) => build(username)
	});
}

/** Singleton for the session (module state = the "server process"). */
export const mockApi = createMockApi();
