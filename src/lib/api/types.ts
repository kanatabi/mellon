/**
 * The AdminApi domain — extracted from lumen/DESIGN.md §8 + §9 shapes. This
 * interface IS the working contract while lumen exists only on paper: mock
 * implements it now, the fetch adapter will implement it in Phase B, and the
 * UI cannot tell the difference (mock-first doctrine, inherited from earendil).
 */

/** §4 state machine: draft → published ⇄ unpublished. No path back to draft. */
export type PostStatus = 'draft' | 'published' | 'unpublished';

export interface PostSummaryAdmin {
	slug: string;
	title: string;
	subtitle: string;
	status: PostStatus;
	createdAt: string;
	/** ISO instant of the latest publish; null until the first one. */
	publishedAt: string | null;
	updatedAt: string;
	rev: number;
}

export interface PostDraft {
	slug: string;
	title: string;
	subtitle: string;
	/** Explicit preview text; empty ⇒ BE defaults to first paragraph at publish. */
	preview: string;
	date: string;
	tags: string[];
	/** Raw Markdown with fences INTACT (Route B — the stored artifact itself). */
	content: string;
	thumbnail: string | null;
}

export interface PostDetailAdmin extends PostDraft {
	status: PostStatus;
	readTime: number;
	rev: number;
	createdAt: string;
	publishedAt: string | null;
	updatedAt: string;
}

export interface AdminPhoto {
	id: string;
	src: string;
	alt: string;
	width: number;
	height: number;
	createdAt: string;
}

export interface TagCount {
	name: string;
	posts: number;
}

/** Mirrors Bao KV-v2: the double-`data` envelope flattened to what the UI needs. */
export interface SecretPayload {
	data: Record<string, string>;
	createdTime: string;
	version: number;
	destroyed: boolean;
	deletionTime: string | null;
}

export interface SecretMeta {
	currentVersion: number;
	versions: { version: number; createdTime: string; destroyed: boolean }[];
}

export interface SecretPath {
	app: string;
	env: string;
}

/** Admin-side list filters — relayed to lumen in Phase B, never filtered in UI. */
export interface PostListOpts {
	status?: PostStatus;
	q?: string;
	/** OR semantics on tags, mirroring earendil's §3 list contract. */
	tag?: string[];
	/** Inclusive YYYY-MM-DD window on the editorial date. */
	from?: string;
	to?: string;
	/** Sort key; default newest-updated. */
	sort?: 'newest' | 'oldest' | 'title';
}

export class AdminApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'AdminApiError';
	}
}

export interface AdminApi {
	// session (mock: any non-empty identity; lumen: real credentials)
	login(username: string, password: string): Promise<{ token: string }>;

	listPosts(opts?: PostListOpts): Promise<PostSummaryAdmin[]>;
	getPost(slug: string): Promise<PostDetailAdmin>;
	/** create ⇒ rev starts at 1. update ⇒ CAS on `rev`, 412-style on mismatch. */
	createPost(draft: PostDraft): Promise<PostDetailAdmin>;
	updatePost(slug: string, draft: PostDraft, rev: number): Promise<PostDetailAdmin>;
	publishPost(slug: string): Promise<PostDetailAdmin>;
	unpublishPost(slug: string): Promise<PostDetailAdmin>;
	deletePost(slug: string): Promise<void>;

	listPhotos(): Promise<AdminPhoto[]>;
	addPhoto(p: { src: string; alt: string; width: number; height: number }): Promise<AdminPhoto>;

	listTags(): Promise<TagCount[]>;

	listSecretPaths(): Promise<SecretPath[]>;
	readSecret(app: string, env: string, version?: number): Promise<SecretPayload | null>;
	secretMeta(app: string, env: string): Promise<SecretMeta | null>;
	/** CAS write — `cas` must equal currentVersion; creates a new version. */
	writeSecret(app: string, env: string, data: Record<string, string>, cas: number): Promise<number>;
}
