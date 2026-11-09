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
	/** Where the bytes live, as served: mock era = mellon-local `/api/media/<id>`;
	 *  Phase B = absolute CDN URL from lumen's object-storage relay. Markdown
	 *  embeds this verbatim — the portal never constructs it. */
	src: string;
	alt: string;
	width: number;
	height: number;
	/** Curation flag: publish to the blog's public Gallery page. Companion
	 *  images for articles stay false. Uploads default FALSE — surfacing
	 *  publicly is a deliberate act (owner decision 2026-11-08). */
	gallery: boolean;
	/** Curation group (theme: landscapes, street…). ADMIN-INTERNAL: the
	 *  public list returns every gallery=true photo regardless of collection;
	 *  collections are not (yet) a publishing axis. One home per photo;
	 *  null = uncategorized. Names live in the collection vocabulary. */
	collection: string | null;
	createdAt: string;
}

export interface CollectionCount {
	name: string;
	photos: number;
}

/** Photo list filters — relayed like posts'; the page never sorts itself. */
export interface PhotoListOpts {
	/** Collection names (OR semantics); the literal 'uncategorized' matches
	 *  the null bucket. */
	collections?: string[];
	gallery?: boolean;
	/** Inclusive YYYY-MM-DD window on createdAt. */
	from?: string;
	to?: string;
	/** 1-based page (default 1); out-of-range pages clamp. */
	page?: number;
	sort?: 'created' | 'title' | 'collection';
	dir?: 'asc' | 'desc';
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

/** Paged envelope — same shape the public §1 list endpoints use, so the
 *  portal can answer "is there a next page?" honestly (total, not vibes). */
export interface Paged<T> {
	total: number;
	items: T[];
	/** 1-based. */
	page: number;
	pageSize: number;
}

export const POSTS_PAGE_SIZE = 20;
export const PHOTOS_PAGE_SIZE = 24;

/** Admin-side list filters — relayed to lumen in Phase B, never filtered in UI. */
export interface PostListOpts {
	status?: PostStatus;
	/** OR semantics on tags, mirroring earendil's §3 list contract.
	 *  (2026-11-08 audit: a `q` filter here was the palette's pre-search()
	 *  hack — dead surface, retired; content search is search(q) alone.) */
	tag?: string[];
	/** Inclusive YYYY-MM-DD window on the editorial date. */
	from?: string;
	to?: string;
	/** Sort field (default `updated`) + direction (default `desc`). */
	sort?: 'updated' | 'created' | 'published' | 'title';
	dir?: 'asc' | 'desc';
	/** 1-based page (default 1); out-of-range pages clamp. */
	page?: number;
}

/** Palette search results — content search is the API's job (§7 doctrine:
 *  commands/navigation are portal-side, "what matches?" is served here).
 *  Phase B: Meilisearch-backed (drafts included for admin); the mock does
 *  honest substring matching on the same fields. */
export interface SearchResults {
	posts: PostSummaryAdmin[];
	photos: AdminPhoto[];
	/** Vocabulary matches — a NAME prefix lookup (lumen: Postgres, not
	 *  Meilisearch), not a relevance search. Selecting one filters the post
	 *  list (`/posts?tag=`), it never opens a "tag page". */
	tags: TagCount[];
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
	/** Phase B: `token` is an HS256 JWT (claims sub/iat/exp/tv/jti, 12h TTL —
	 *  lumen §8); `expiresIn` is seconds, and the login action sizes the cookie
	 *  from it — "session length is set by lumen" is a mechanism, not a slogan. */
	login(username: string, password: string): Promise<{ token: string; expiresIn: number }>;
	/** Revoke server-side (lumen bumps `token_version` — every outstanding
	 *  token dies). Server-side verb: the /logout action calls it best-effort
	 *  before clearing the cookie; the browser client throws like login. */
	logout(): Promise<void>;

	listPosts(opts?: PostListOpts): Promise<Paged<PostSummaryAdmin>>;
	getPost(slug: string): Promise<PostDetailAdmin>;
	/** create ⇒ rev starts at 1. update ⇒ CAS on `rev`, 409 on mismatch (lumen ships 409 for both CAS surfaces). */
	createPost(draft: PostDraft): Promise<PostDetailAdmin>;
	updatePost(slug: string, draft: PostDraft, rev: number): Promise<PostDetailAdmin>;
	publishPost(slug: string): Promise<PostDetailAdmin>;
	unpublishPost(slug: string): Promise<PostDetailAdmin>;
	/** Server soft-deletes (row hidden; media retained until the GC window —
	 *  lumen §8). The portal's contract is just: it disappears from every
	 *  list and read afterward. */
	deletePost(slug: string): Promise<void>;

	listPhotos(opts?: PhotoListOpts): Promise<Paged<AdminPhoto>>;
	/** Upload entry point. `dataUrl` stands in for the bytes during the mock
	 *  era (journaled); Phase B transports multipart POST /admin/photos and
	 *  lumen probes dims + strips EXIF server-side — this interface's output
	 *  (an AdminPhoto whose src is the serving URL) is what survives both. */
	addPhoto(p: {
		name: string;
		dataUrl: string;
		width: number;
		height: number;
	}): Promise<AdminPhoto>;
	/** Curation metadata setter (alt/collection/gallery). No CAS: photos carry
	 *  no rev, and single-author album metadata is last-write-wins (journaled). */
	updatePhoto(
		id: string,
		patch: { alt?: string; collection?: string | null; gallery?: boolean }
	): Promise<AdminPhoto>;
	/** Detail-page fetch (404 honest). Phase B: GET /admin/photos/:id. */
	getPhoto(id: string): Promise<AdminPhoto>;
	/** Posts whose body embeds this photo's src — the content scan that makes
	 *  delete-informed possible. Phase B: LIKE over Post.content. */
	listPhotoReferences(id: string): Promise<{ slug: string; title: string }[]>;
	/** Removes the photo from the library; the BYTES outlive the row until
	 *  storage GC (Phase B object-store lifecycle). Irreversible for the
	 *  admin: referencing posts show a broken picture afterwards — warn,
	 *  never block (owner call 2026-11-08). */
	deletePhoto(id: string): Promise<void>;

	listCollections(): Promise<CollectionCount[]>;
	/** Same vocabulary semantics as tags: eager, slugified, 409 on duplicates. */
	createCollection(name: string): Promise<CollectionCount>;

	listTags(): Promise<TagCount[]>;
	/** One call serves ALL content groups for the palette (≤8 each). */
	search(q: string): Promise<SearchResults>;
	/** Vocabulary is a first-class store (not derived): a tag exists once
	 *  created, used or not. Name is slugified; 409 on duplicates. */
	createTag(name: string): Promise<TagCount>;

	listSecretPaths(): Promise<SecretPath[]>;
	readSecret(app: string, env: string, version?: number): Promise<SecretPayload | null>;
	secretMeta(app: string, env: string): Promise<SecretMeta | null>;
	/** CAS write — `cas` must equal currentVersion; creates a new version. */
	writeSecret(app: string, env: string, data: Record<string, string>, cas: number): Promise<number>;
}
