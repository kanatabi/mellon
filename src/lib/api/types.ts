/**
 * The AdminApi domain — extracted from lumen/DESIGN.md §8 + §9 shapes. This
 * interface IS the working contract while lumen exists only on paper: mock
 * implements it now, the fetch adapter will implement it in Phase B, and the
 * UI cannot tell the difference (mock-first doctrine, inherited from earendil).
 */

export type PostStatus = 'draft' | 'published';

export interface PostSummaryAdmin {
	slug: string;
	title: string;
	subtitle: string;
	status: PostStatus;
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

	listPosts(opts?: { status?: PostStatus; q?: string }): Promise<PostSummaryAdmin[]>;
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
