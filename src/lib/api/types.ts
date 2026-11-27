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

/** The EXIF capture's curated subset (Round B 2026-11-22) — the panel's
 *  display fields. GPS is deliberately absent: never read, never shipped,
 *  never stored (the privacy promise, denied at both ends by construction). */
export interface PhotoExif {
	takenAt?: string;
	camera?: string;
	lens?: string;
	shutter?: string;
	iso?: number;
	aperture?: number;
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
	/** The stored EXIF subset (lumen's allowlist verdict); null = pre-capture
	 *  upload or a format without metadata — the panel's honest empty state. */
	exif: PhotoExif | null;
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
	/** Engine search (lumen M3 desk round): non-empty q routes through the
	 *  Meilisearch `photos` index — typo-tolerant, collection/gallery facets
	 *  honored; from/to are NOT (the PhotoDoc carries no date attribute).
	 *  Order BECOMES RELEVANCE (sort ignored while q lives); total is the
	 *  FULL match count. Empty/absent = the old SQL browse door. */
	q?: string;
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
	/** The desk's manual promotion flag (lumen 0005: was `cloud`): membership
	 *  in the earendil TOPICS widget. Vocabulary exists WITHOUT it. */
	featured: boolean;
	/** ISO instants (lumen tag-desk round): the desk sorts/filters on these;
	 *  the portal renders them as-is. */
	createdAt: string;
	updatedAt: string;
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
	/** Pin = operator INTENT (D1): the recorded version, or null. It never
	 *  reroutes a read — head is always what reads serve. */
	pinnedVersion: number | null;
}

export interface SecretPath {
	app: string;
	env: string;
}

/** One matrix cell (C1): counts over truth — values never leave lumen. */
export interface EstateRow {
	app: string;
	env: string;
	version: number;
	pinnedVersion: number | null;
	keys: number;
	emptyKeys: number;
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
	 *  hack — dead surface, retired; content search is search(q) alone.
	 *  The desk `q` below is NOT that surface reborn: it is lumen's ratified
	 *  engine door on the list verb (M3 desk-search round), URL-driven.) */
	tag?: string[];
	/** Engine search: non-empty q routes the desk list through Meilisearch —
	 *  typo-tolerant across the whole corpus, facets honored (status, tag,
	 *  from, to), `page` pages through. ORDER BECOMES RELEVANCE (sort is
	 *  ignored server-side while q lives); total = FULL match count.
	 *  Empty/absent = the old SQL browse door, unchanged behavior. */
	q?: string;
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
		message: string,
		/** The chain's id (2026-11-15): the minted one, or lumen's echo when it
		 * answered — the same id both services' logs print. Never rendered in
		 * UI copy (ghost-field doctrine: the wire message renders verbatim);
		 * it rides for logs and support escalation. */
		readonly requestId?: string
	) {
		super(message);
		this.name = 'AdminApiError';
	}
}

/** The identity a live bearer resolves to (lumen reads id + scopes +
 *  must_change from the user row PER REQUEST — the JWT carries identity and
 *  the grants STAMPED AT MINT, and every scope mutation bumps
 *  token_version, so a demotion bites within the request, not the next
 *  login). `scopes` is lumen's truth: the portal renders it as
 *  affordances and never enforces. */
export interface Principal {
	username: string;
	id: string;
	scopes: string[];
	mustChange: boolean;
	disabled: boolean;
	/** The profile's display name (whoami carries it; fallback = username). */
	name: string;
	/** Private account contact; empty = unset. Never public. */
	email: string;
}

/** Login/register wire shape (lumen answers exactly these fields —
 *  identity comes from whoami, not from guessing the login subject): the
 *  session plus what the portal ROUTES on — mustChange sends the fresh/temp
 *  user straight to /setup?change instead of the desk; scopes is the grant
 *  set stamped at mint (refreshed by the next login). */
export interface LoginResponse {
	token: string;
	expiresIn: number;
	scopes: string[];
	mustChange: boolean;
	disabled: boolean;
}

/** One line of the admin user list (lumen GET /admin/users). */
export interface AdminUserRow {
	id: string;
	username: string;
	name: string;
	email: string;
	scopes: string[];
	mustChange: boolean;
	disabled: boolean;
	createdAt: string;
}

/** The self profile is the same row shape (GET /admin/profile). */
export type Profile = AdminUserRow;

/** One line of the PORTAL-MANAGED scope catalog (the RBAC spine): the
 *  assignable vocabulary — onboarding a scope is a portal action, never
 *  manual SQL. */
export interface CatalogEntry {
	scope: string;
	description: string;
}

/** The scope-assignment write (lumen PATCH /admin/users/:u/scopes): the
 *  assignment replaces the set and BUMPS token_version — the user's other
 *  sessions die (re-login). */
export interface ScopeAssignment {
	username: string;
	scopes: string[];
	tokenVersion: number;
}

// ---- the tasks + notifications contract (M4.C) ----
// lumen's internal/tasks + internal/notifications wire (M2), mapped 1:1 from
// its transport structs: camelCase keys, RFC 3339 timestamp strings, and
// nulls meaning "not set" (never empty strings). The SEND door is
// deliberately absent — it is an app-to-app API (one shared in-cluster
// token), not a portal verb; the browser never calls it.

/** The three workspace views. Lumen owns the day math (the adapters ship
 *  X-Client-Timezone); the portal never re-derives "today". */
export type TaskView = 'today' | 'upcoming' | 'all';
export type TaskPriority = 'high' | 'medium' | 'low' | 'none';
/** The caller's per-project role (the membership key behind the scope gate). */
export type TaskRole = 'admin' | 'member';

/** One project as the CALLER sees it: `role` is their own membership, the
 *  counts are live tasks. A completed project stays listed (completedAt is a
 *  flag, C4); only a soft delete removes it from live reads. */
export interface TaskProject {
	id: string;
	name: string;
	role: TaskRole;
	creatorId: string | null;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
	taskCount: number;
	openCount: number;
}

export interface TaskItem {
	id: string;
	projectId: string;
	projectName: string;
	creatorId: string | null;
	/** Read-only label (users.display_name); creatorId is the identity. */
	creatorName: string | null;
	/** The assignee's user id (v1: ONE assignee); null = unassigned. */
	assignedTo: string | null;
	/** Read-only label (users.display_name); assignedTo is the identity. */
	assigneeName: string | null;
	title: string;
	notes: string;
	priority: TaskPriority;
	dueAt: string | null;
	done: boolean;
	doneAt: string | null;
	createdAt: string;
	updatedAt: string;
	commentCount: number;
	subtaskCount: number;
	subtaskDone: number;
}

/** The four stat cards, computed by lumen in the caller's zone over their
 *  WHOLE membership (a project filter never narrows them). */
export interface TaskStats {
	open: number;
	dueToday: number;
	completedWeek: number;
	overdue: number;
}

export interface TaskSubtask {
	id: string;
	taskId: string;
	title: string;
	done: boolean;
	createdAt: string;
}

export interface TaskComment {
	id: string;
	taskId: string;
	authorId: string | null;
	authorName: string | null;
	body: string;
	createdAt: string;
}

export interface TaskActivity {
	/** The activity table's BIGINT identity, serialized as a JSON number. */
	id: number;
	taskId: string;
	actorId: string | null;
	actorName: string | null;
	verb: string;
	detail: string;
	createdAt: string;
}

/** The drawer's one snapshot: the task plus its checklist, comments and
 *  timeline (all arrays are `[]`, never null). */
export interface TaskDetail {
	task: TaskItem;
	subtasks: TaskSubtask[];
	comments: TaskComment[];
	activity: TaskActivity[];
}

export interface TaskInvite {
	id: string;
	projectId: string;
	projectName: string;
	inviterId: string;
	inviterName: string;
	inviteeId: string;
	expiresAt: string;
	createdAt: string;
}

export interface TaskMember {
	userId: string;
	username: string;
	/** The account's display name — the roster's primary label. */
	name: string;
	role: TaskRole;
	invitedBy: string | null;
	joinedAt: string;
}

/** One invite-typeahead row. Email is a server-side match key only — it is
 *  never part of this wire shape. */
export interface TaskPerson {
	username: string;
	name: string;
}

/** estate-generic bell row: `body` is sanitized inline HTML (plain `title`),
 *  `payload` carries the same-origin click-through (`url`) and refs. */
export interface NotificationItem {
	id: string;
	app: string;
	type: string;
	title: string;
	body: string;
	payload: Record<string, unknown>;
	readAt: string | null;
	expiresAt: string;
	createdAt: string;
}

/** The grouped workspace page: projects → tasks for one view, plus the cards. */
export interface TaskWorkspace {
	projects: TaskProject[];
	tasks: TaskItem[];
	stats: TaskStats;
}

export interface TaskWorkspaceQuery {
	view: TaskView;
	projectId?: string;
	timezone?: string;
}

export interface TaskCreateInput {
	projectId: string;
	title: string;
	notes?: string;
	priority?: TaskPriority;
	dueAt?: string | null;
	assignedTo?: string | null;
}

/** The PATCH's THREE-WAY presence: an absent key leaves the field, an
 *  explicit null clears dueAt/assignedTo, and a value sets it. The adapter
 *  builds the JSON body explicitly so `undefined` never becomes a key. */
export interface TaskPatchInput {
	title?: string;
	notes?: string;
	priority?: TaskPriority;
	dueAt?: string | null;
	assignedTo?: string | null;
}

export interface NotificationQuery {
	unread?: boolean;
	/** Opaque cursor from the previous page's `nextBefore`. */
	before?: string;
	limit?: number;
}

/** Newest first; `nextBefore` is set only when the page was FULL. */
export interface NotificationPage {
	items: NotificationItem[];
	nextBefore: string | null;
}

export interface AdminApi {
	// session (mock: any non-empty identity; lumen: real credentials)
	/** Phase B: `token` is an HS256 JWT (claims sub/iat/exp/tv/jti, 12h TTL —
	 *  lumen §8); `expiresIn` is seconds, and the login action sizes the cookie
	 *  from it — "session length is set by lumen" is a mechanism, not a slogan.
	 *  role/mustChange (multi-user round 2026-11-11) drive portal routing:
	 *  mustChange lands the visitor on /setup?change instead of the desk. */
	login(username: string, password: string): Promise<LoginResponse>;
	/** Revoke server-side (lumen bumps `token_version` — every outstanding
	 *  token dies). Server-side verb: the /logout action calls it best-effort
	 *  before clearing the cookie; the browser client throws like login. */
	logout(): Promise<void>;

	/** Wizard probe (lumen GET /admin/setup — PUBLIC): unclaimed == the users
	 *  table is empty and /setup should be the front door. */
	setupStatus(): Promise<{ unclaimed: boolean }>;
	/** TOFU claim (lumen POST /admin/setup/register): succeeds exactly once,
	 *  ever; after the estate is claimed lumen answers 410 Gone. Resolves to
	 *  a full LoginResponse — the wizard session is minted on the spot. */
	registerFirstAdmin(username: string, password: string): Promise<LoginResponse>;
	/** Who the bearer is (lumen GET /admin/session): the portal's layout and
	 *  the admin-only surfaces (users) gate on this, never on cookie folklore. */
	whoami(): Promise<Principal>;
	/** The self profile (lumen GET /admin/profile): display name + private
	 *  email + scopes + lineage. Auth-only — it is yourself. */
	profile(): Promise<Profile>;
	/** Self-service profile write (lumen PATCH /admin/profile). */
	updateProfile(name: string, email: string): Promise<Profile>;
	/** The forced-change flow's write (lumen POST /admin/session/password):
	 *  clears must_change and REVOKES old sessions — the caller re-mints via
	 *  login(next) to keep the visitor comfortably logged in. */
	changePassword(current: string, next: string): Promise<void>;

	// ---- the passkey round (C1): the auth-method seam ----
	// lumen's normalized shape: every login method is begin -> finish ->
	// the ONE mint. The BROWSER owns the WebAuthn dance (the private key
	// never leaves the authenticator); the server relays and mints.

	/** The capability probe (lumen GET /admin/session/auth/methods —
	 *  PUBLIC): the login UI renders a button per enabled method. New
	 *  methods (oauth) join without a UI rewrite. */
	authMethods(): Promise<{ methods: string[] }>;
	/** Passkey LOGIN begin (lumen POST /admin/session/webauthn/login/begin —
	 *  PUBLIC): the WebAuthn credential options + the signed state the
	 *  client carries to finish. Options are the browser's shape (the
	 *  challenge is base64url; `#lib/webauthn.client.ts` decodes). */
	passkeyLoginBegin(): Promise<{ state: string; options: unknown }>;
	/** Passkey LOGIN finish (lumen POST .../login/finish — PUBLIC): the
	 *  assertion is verified, the user resolved THROUGH the credential,
	 *  and THE MINT happens here. Full LoginResponse (the cookie path is
	 *  identical to the password login's). */
	passkeyLoginFinish(state: string, response: unknown): Promise<LoginResponse>;
	/** Passkey REGISTER begin (authenticated): the creation options +
	 *  state; existing credentials ride the exclude list. */
	passkeyRegisterBegin(): Promise<{ state: string; options: unknown }>;
	/** Passkey REGISTER finish (authenticated): the attestation is
	 *  verified and stored with the user's label. Registering does NOT
	 *  bump token_version — it changes what can AUTHENTICATE, not what
	 *  the session may do. */
	passkeyRegisterFinish(
		state: string,
		label: string,
		response: unknown
	): Promise<{ passkey: { id: string; label: string; createdAt: string } }>;
	/** The settings roster (the user's own registered passkeys). */
	passkeys(): Promise<{
		passkeys: { id: string; label: string; createdAt: string; lastUsedAt: string }[];
	}>;
	/** Delete one of the user's own passkeys. Never a lockout: every
	 *  account holds a password by construction. */
	passkeyDelete(id: string): Promise<void>;
	/** Admin-eyes-only (lumen enforces 403; the portal hides the door too). */
	listUsers(): Promise<AdminUserRow[]>;
	/** lumen generates the temp server-side (syllable form ~50 bits);
	 *  tempPassword appears in THIS response exactly once — never logged,
	 *  never stored unhashed, never re-readable. */
	createUser(username: string, scopes: string[]): Promise<AdminUserRow & { tempPassword: string }>;
	/** Replace the user's scope set (lumen PATCH /admin/users/:u/scopes):
	 *  the RBAC spine — a demotion is immediate (token_version bumps). */
	updateUserScopes(username: string, scopes: string[]): Promise<ScopeAssignment>;
	/** The user-LIFECYCLE verbs (lumen, users:manage-gated): revoke kicks
	 *  live sessions (tv bump, password untouched); force-change arms
	 *  must_change (the NEXT request 428s); disable denies login AND
	 *  kills live sessions (tv bump); enable re-admits; delete removes
	 *  the account (the guards — self-delete + the last users:manage
	 *  holder — are lumen's 400/409). */
	revokeSessions(username: string): Promise<ScopeAssignment>;
	forcePasswordChange(username: string): Promise<{ username: string; mustChange: boolean }>;
	setUserDisabled(username: string, disabled: boolean): Promise<ScopeAssignment>;
	deleteUser(username: string): Promise<void>;
	/** The PORTAL-MANAGED catalog (the assignable vocabulary). */
	listScopes(): Promise<CatalogEntry[]>;
	/** Onboard a scope (grammar-checked server-side; duplicates are
	 *  idempotent). */
	addScope(scope: string, description: string): Promise<CatalogEntry>;
	/** Remove a catalog scope; lumen REFUSES while any user holds it —
	 *  the 409 copy carries the counts, rendered verbatim. */
	deleteScope(scope: string): Promise<void>;
	/** New temp, must_change rearms, token_version bumps (their live sessions
	 *  die immediately). Once-only reveal like create. */
	resetUserPassword(username: string): Promise<{ tempPassword: string }>;

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
	/** Upload entry point. `{ file }` = the browser's shape (the adapter wraps
	 *  it in multipart). `{ body }` = the relay's shape: the incoming multipart
	 *  request streams through untouched — no parse, no buffer (the 100 MB path). */
	addPhoto(
		p:
			| { file: Blob; name: string; exif?: PhotoExif | null }
			| { body: ReadableStream<Uint8Array>; contentType: string; contentLength?: number }
	): Promise<AdminPhoto>;
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
	/** Same array shape, ordered by created_at DESC (lumen `?order=newest`). */
	listNewestTags(): Promise<TagCount[]>;
	/** Typo-tolerant NAME search (lumen engine, relevance-ordered) — paged
	 *  like the other lists so the desk can answer "is there a next page?". */
	searchTags(q: string, page?: number, pageSize?: number): Promise<Paged<TagCount>>;
	/** Feature/un-feature a SET of names in one round trip; resolves to the
	 *  number of rows that actually changed. */
	bulkFeatureTags(names: string[], featured: boolean): Promise<number>;
	/** One call serves ALL content groups for the palette (≤8 each). */
	search(q: string): Promise<SearchResults>;
	/** Vocabulary is a first-class store (not derived): a tag exists once
	 *  created, used or not. Name is slugified; 409 on duplicates. */
	createTag(name: string): Promise<TagCount>;
	/** The desk's row verb: rename propagates to every post (id-keyed FKs),
	 *  featured toggles the widget. 409 on collision. */
	updateTag(name: string, patch: { name?: string; featured?: boolean }): Promise<TagCount>;
	/** Refuses (409, message naming the COUNT) while any live post references
	 *  the tag — unassignment is the editor's job, never a side effect. */
	deleteTag(name: string): Promise<void>;

	listSecretPaths(): Promise<SecretPath[]>;
	readSecret(app: string, env: string, version?: number): Promise<SecretPayload | null>;
	secretMeta(app: string, env: string): Promise<SecretMeta | null>;
	/** CAS write — `cas` must equal currentVersion; creates a new version.
	 *  While the path is PINNED this refuses with 403 and the wire copy
	 *  "pinned at v<N> — unpin first" (pin is a lock, lumen 230783b) —
	 *  mellon renders it verbatim. 409 CAS mismatch. */
	writeSecret(app: string, env: string, data: Record<string, string>, cas: number): Promise<number>;
	/** Onboard an app namespace (PLAN §2.1): envs omitted ⇒ the default trio
	 *  (D4 — a default, not a schema). Empty bundles; 400 bad slug, 409 the
	 *  namespace (even partially) exists. Apps are DATA: any slug valid. */
	onboardApp(app: string, envs?: string[]): Promise<{ app: string; envs: string[] }>;
	/** Extend an existing app with one env, seeded to the app's CANONICAL
	 *  key set (union of live siblings, empty values) — a late env must never
	 *  drift a smaller shape. 404 unknown app (a typo, not intent),
	 *  409 duplicate env. */
	addEnv(app: string, env: string): Promise<{ app: string; env: string }>;
	/** Pin a LIVE, non-destroyed version of this path (pin is a LOCK:
	 *  CAS writes to the path are refused until unpin — reads keep serving
	 *  head, D1). 404 unknown path or unknown version. */
	pinSecret(app: string, env: string, version: number): Promise<{ pinnedVersion: number }>;
	/** Release the write lock (no sentinel values — absence is the null). */
	unpinSecret(app: string, env: string): Promise<void>;
	/** The estate matrix feed (C1): one sweep of every app/env — head
	 *  version, pin lock state, key counts, empty-key counts. Arithmetic only. */
	estateSummary(): Promise<EstateRow[]>;

	// ---- the tasks workspace (lumen internal/tasks, M2 wire) ----
	// Time-of-day math is lumen's, computed in the caller's zone: BOTH
	// adapters send X-Client-Timezone whenever a zone is known.
	/** The grouped page: projects → tasks for one view, plus the four-card
	 *  rollup (membership-wide, never narrowed by the project filter). */
	tasksWorkspace(opts: TaskWorkspaceQuery): Promise<TaskWorkspace>;
	taskStats(timezone?: string): Promise<TaskStats>;
	taskProjectCreate(name: string): Promise<TaskProject>;
	taskProjectRename(id: string, name: string): Promise<void>;
	/** The completed flag (C4): true stamps completed_at once, false reopens. */
	taskProjectComplete(id: string, completed: boolean): Promise<boolean>;
	/** SOFT delete: the project disappears from every live read; history stays. */
	taskProjectDelete(id: string): Promise<void>;
	taskMembers(id: string): Promise<TaskMember[]>;
	/** Promote/demote (many admins allowed); demoting the LAST admin is a 409. */
	taskMemberRole(id: string, userId: string, role: TaskRole): Promise<void>;
	/** Removal also unassigns that member's tasks in the project; the last
	 *  admin is a 409 (a project must keep one). */
	taskMemberRemove(id: string, userId: string): Promise<void>;
	taskInviteCreate(projectId: string, username: string): Promise<TaskInvite>;
	/** Project-admin people search for the invite field: username/display-name
	 *  prefixes or an EXACT email; members/pending invitees are excluded. */
	taskInviteeSearch(projectId: string, query: string): Promise<TaskPerson[]>;
	/** The caller's pending (unexpired) invite inbox. */
	taskInvites(): Promise<TaskInvite[]>;
	/** 410 when the 24h TTL passed (the row is consumed); 404 otherwise. */
	taskInviteAccept(id: string): Promise<TaskInvite>;
	taskInviteDecline(id: string): Promise<void>;
	taskInviteRevoke(projectId: string, inviteId: string): Promise<void>;
	taskCreate(input: TaskCreateInput): Promise<TaskItem>;
	taskGet(id: string): Promise<TaskDetail>;
	/** Three-way presence: absent leaves the field, null clears
	 *  dueAt/assignedTo, a value sets it (title/notes/priority are strings). */
	taskUpdate(id: string, patch: TaskPatchInput): Promise<TaskItem>;
	taskToggle(id: string): Promise<TaskItem>;
	taskDelete(id: string): Promise<void>;
	taskSubtaskCreate(taskId: string, title: string): Promise<TaskSubtask>;
	taskSubtaskUpdate(
		taskId: string,
		subtaskId: string,
		patch: { title?: string; done?: boolean }
	): Promise<TaskSubtask>;
	taskSubtaskDelete(taskId: string, subtaskId: string): Promise<void>;
	taskCommentCreate(taskId: string, body: string): Promise<TaskComment>;
	taskCommentDelete(taskId: string, commentId: string): Promise<void>;

	// ---- the notifications bell (lumen internal/notifications, M2 wire) ----
	// Reads/marks only. The SEND door is app-to-app (ONE shared in-cluster
	// token) and deliberately not part of the portal's contract.
	notifications(query?: NotificationQuery): Promise<NotificationPage>;
	notificationsUnreadCount(): Promise<number>;
	notificationMarkRead(id: string): Promise<void>;
	/** Returns how many rows actually moved (a second call is honestly 0). */
	notificationsMarkAllRead(): Promise<number>;
}
