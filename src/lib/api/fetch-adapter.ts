/**
 * The real-transport AdminApi (Phase C): every method maps 1:1 onto lumen's
 * §8/§9 routes — the adapter SHIPS the wire, it decides nothing (doctrine:
 * the relay forwards, never decides). Errors surface as AdminApiError with
 * lumen's status codes verbatim; the UI's conflict branches read them.
 *
 * DUAL UPSTREAMS (lumen role split, 2026-11-13): the adapter addresses TWO
 * bases — the control plane (ADMIN_URL) and this env's content lumen
 * (CMS_URL) — and picks per call through the routing table (routing.ts),
 * keyed on the wire path. The table decides; this file just obeys. A lone
 * string target means SINGLE BINARY: both classes ride the one base (the
 * dev default and the pre-split deployments — the wire is identical).
 *
 * Token handling mirrors the design: the bearer IS the mellon session cookie;
 * createApi receives it per call-site (loads/actions/relay all run in request
 * context). No token storage here, no refresh logic — expiry is lumen's
 * 12h claim, revocation is its token_version row, both invisible to this
 * file. Auth forwarding is IDENTICAL for both upstreams — whatever relay
 * headers go to lumen today (the bearer) go to BOTH bases unchanged; mellon
 * itself holds nothing.
 */
import { AdminApiError } from './types.ts';
import { REQUEST_ID_HEADER, newRequestId, echoedRequestId, logAccess } from './requestid.ts';
import { baseFor, upstreamFor } from './routing.ts';
import { DEP, outbound, type OpName } from '#lib/server/metrics.js';
import type {
	AdminUserRow,
	CatalogEntry,
	ScopeAssignment,
	LoginResponse,
	Principal,
	Profile,
	AdminApi,
	AdminPhoto,
	CollectionCount,
	Paged,
	PhotoListOpts,
	PostDetailAdmin,
	PostDraft,
	PostSummaryAdmin,
	PostListOpts,
	SecretMeta,
	SecretPayload,
	EstateRow,
	SecretPath,
	SearchResults,
	TagCount,
	NotificationPage,
	TaskComment,
	TaskCreateInput,
	TaskDetail,
	TaskInvite,
	TaskItem,
	TaskMember,
	TaskPerson,
	TaskPatchInput,
	TaskProject,
	TaskStats,
	TaskSubtask,
	TaskWorkspace
} from './types.ts';

/** Local-dev fallback when no upstream env is set — the cluster always overrides.
 *  Real-by-default (owner ruling 2026-11-09): there is no runtime mock path.
 *  The dev default is ONE binary (:8080), so it feeds both upstream classes. */
export const DEV_DEFAULT_API_BASE = 'http://localhost:8080';

/** The resolved upstream pair: the control plane and this env's content lumen. */
export interface Upstreams {
	admin: string;
	cms: string;
}

const strip = (b: string) => b.replace(/\/+$/, '');

export function createLumenApi(target: string | Upstreams, bearer: string): AdminApi {
	const bases: Upstreams =
		typeof target === 'string'
			? { admin: strip(target), cms: strip(target) } // single binary: one base serves both classes
			: { admin: strip(target.admin), cms: strip(target.cms) };
	/** Resolve a wire path to its upstream base — the routing table's call. */
	const at = (path: string) => baseFor(path, bases) + path;

	async function call<T>(
		method: string,
		path: string,
		opts: {
			op: OpName;
			query?: Record<string, string[]>;
			body?: unknown;
			/** Extra request headers (the tasks family's X-Client-Timezone). */
			headers?: Record<string, string>;
			nullOn404?: boolean;
		}
	): Promise<T> {
		// the correlation seam (2026-11-15): mint → send → the access line.
		// The id rides EVERY call; failures log with it, and the echo lands in
		// the thrown error — one grep chains the portal hop to lumen's logs.
		//
		// the observability round: the call is also COUNTED and BOUNDED —
		// the dependency label maps from the routing table's upstream class
		// (admin → lumen-admin, cms → lumen-cms), the op is the ENUMERATED
		// verb the site threads (the wire paths embed slugs/usernames — a
		// path-derived label would be a cardinality bomb), and the budget
		// aborts a hung lumen instead of hanging the desk.
		const requestId = newRequestId();
		const hop = upstreamFor(path);
		const dep = DEP[hop];
		const url = new URL(at(path));
		for (const [k, vs] of Object.entries(opts.query ?? {}))
			for (const v of vs) url.searchParams.append(k, v);
		let res: Response;
		try {
			res = await outbound(dep, opts.op, (signal) =>
				fetch(url, {
					method,
					signal,
					headers: {
						[REQUEST_ID_HEADER]: requestId,
						...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
						...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
						...(opts.headers ?? {})
					},
					body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
				})
			);
		} catch {
			// ANY transport failure — refused, DNS, or the budget's timeout —
			// is a 503 story to the desk (never a fake success, never a 401:
			// an outage must not clear good session cookies)
			logAccess(hop, method, path, 'unreachable', requestId);
			throw new AdminApiError(503, 'lumen unreachable', requestId);
		}
		logAccess(hop, method, path, res.status, echoedRequestId(res, requestId));
		if (res.status === 404 && opts.nullOn404) return null as T;
		const text = await res.text();
		if (!res.ok) {
			let message = `HTTP ${res.status}`;
			try {
				const j = JSON.parse(text) as { error?: string };
				if (j.error) message = j.error;
			} catch {
				/* non-JSON error body: status line is the message */
			}
			throw new AdminApiError(res.status, message, echoedRequestId(res, requestId));
		}
		return (text ? JSON.parse(text) : undefined) as T;
	}

	const q = (o: Record<string, string | number | boolean | string[] | undefined | null>) => {
		const m: Record<string, string[]> = {};
		for (const [k, v] of Object.entries(o))
			if (v !== undefined && v !== null && v !== '') m[k] = Array.isArray(v) ? v : [String(v)];
		return m;
	};

	return {
		// --- session ---
		login: (username, password) =>
			call<LoginResponse>('POST', '/admin/session', {
				op: 'session.mint',
				body: { username, password }
			}),
		setupStatus: () => call<{ unclaimed: boolean }>('GET', '/admin/setup', { op: 'setup.status' }),
		registerFirstAdmin: (username, password) =>
			call<LoginResponse>('POST', '/admin/setup/register', {
				op: 'setup.register',
				body: { username, password }
			}),
		whoami: () => call<Principal>('GET', '/admin/session', { op: 'session.read' }),
		profile: () => call<Profile>('GET', '/admin/profile', { op: 'profile.read' }),
		updateProfile: (name, email) =>
			call<Profile>('PATCH', '/admin/profile', {
				op: 'profile.write',
				body: { name, email }
			}),
		// ---- the passkey round (C1): the auth-method seam ----
		authMethods: () =>
			call<{ methods: string[] }>('GET', '/admin/session/auth/methods', { op: 'session.methods' }),
		passkeyLoginBegin: () =>
			call<{ state: string; options: unknown }>('POST', '/admin/session/webauthn/login/begin', {
				op: 'session.passkey.begin'
			}),
		passkeyLoginFinish: (state, response) =>
			call<LoginResponse>('POST', '/admin/session/webauthn/login/finish', {
				op: 'session.passkey.finish',
				body: { state, response }
			}),
		passkeyRegisterBegin: () =>
			call<{ state: string; options: unknown }>('POST', '/admin/session/webauthn/register/begin', {
				op: 'session.passkey.begin'
			}),
		passkeyRegisterFinish: (state, label, response) =>
			call<{ passkey: { id: string; label: string; createdAt: string } }>(
				'POST',
				'/admin/session/webauthn/register/finish',
				{ op: 'session.passkey.register', body: { state, label, response } }
			),
		passkeys: () =>
			call<{ passkeys: { id: string; label: string; createdAt: string; lastUsedAt: string }[] }>(
				'GET',
				'/admin/session/webauthn',
				{ op: 'session.passkey.roster' }
			),
		passkeyDelete: (id) =>
			call<void>('DELETE', `/admin/session/webauthn/${encodeURIComponent(id)}`, {
				op: 'session.passkey.delete'
			}),
		changePassword: (current, next) =>
			call<void>('POST', '/admin/session/password', {
				op: 'session.password',
				body: { current, next }
			}),
		listUsers: () => call<AdminUserRow[]>('GET', '/admin/users', { op: 'users.list' }),
		createUser: (username, scopes) =>
			call<AdminUserRow & { tempPassword: string }>('POST', '/admin/users', {
				op: 'users.create',
				body: { username, scopes }
			}),
		updateUserScopes: (username, scopes) =>
			call<ScopeAssignment>('PATCH', `/admin/users/${encodeURIComponent(username)}/scopes`, {
				op: 'users.scopes.set',
				body: { scopes }
			}),
		revokeSessions: (username) =>
			call<ScopeAssignment>(
				'POST',
				`/admin/users/${encodeURIComponent(username)}/revoke-sessions`,
				{
					op: 'users.revoke',
					body: {}
				}
			),
		forcePasswordChange: (username) =>
			call<{ username: string; mustChange: boolean }>(
				'POST',
				`/admin/users/${encodeURIComponent(username)}/force-change`,
				{ op: 'users.force', body: {} }
			),
		setUserDisabled: (username, disabled) =>
			call<ScopeAssignment>(
				'POST',
				`/admin/users/${encodeURIComponent(username)}/${disabled ? 'disable' : 'enable'}`,
				{ op: disabled ? 'users.disable' : 'users.enable', body: {} }
			),
		deleteUser: (username) =>
			call<void>('DELETE', `/admin/users/${encodeURIComponent(username)}`, { op: 'users.delete' }),
		listScopes: () => call<CatalogEntry[]>('GET', '/admin/scopes', { op: 'scopes.list' }),
		addScope: (scope, description) =>
			call<CatalogEntry>('POST', '/admin/scopes', {
				op: 'scopes.add',
				body: { scope, description }
			}),
		deleteScope: (scope) =>
			call<void>('DELETE', `/admin/scopes/${encodeURIComponent(scope)}`, { op: 'scopes.delete' }),
		resetUserPassword: (username) =>
			call<{ tempPassword: string }>(
				'POST',
				`/admin/users/${encodeURIComponent(username)}/reset-password`,
				{ op: 'users.reset', body: {} }
			),
		// DELETE is 204-no-body; call() returns undefined for empty text
		logout: () => call<void>('DELETE', '/admin/session', { op: 'session.logout' }),

		// --- posts (§8) ---
		listPosts: (o?: PostListOpts) =>
			call<Paged<PostSummaryAdmin>>('GET', '/admin/posts', {
				op: 'posts.list',
				query: q({
					status: o?.status,
					tag: o?.tag,
					q: o?.q,
					from: o?.from,
					to: o?.to,
					sort: o?.sort,
					dir: o?.dir,
					page: o?.page
				})
			}),
		getPost: (slug) =>
			call<PostDetailAdmin>('GET', `/admin/posts/${encodeURIComponent(slug)}`, {
				op: 'posts.read'
			}),
		createPost: (draft: PostDraft) =>
			call<PostDetailAdmin>('POST', '/admin/posts', { op: 'posts.create', body: draft }),
		updatePost: (slug, draft: PostDraft, rev: number) =>
			call<PostDetailAdmin>('PUT', `/admin/posts/${encodeURIComponent(slug)}`, {
				op: 'posts.update',
				body: { draft, rev }
			}),
		publishPost: (slug) =>
			call<PostDetailAdmin>('POST', `/admin/posts/${encodeURIComponent(slug)}/publish`, {
				op: 'posts.publish'
			}),
		unpublishPost: (slug) =>
			call<PostDetailAdmin>('POST', `/admin/posts/${encodeURIComponent(slug)}/unpublish`, {
				op: 'posts.unpublish'
			}),
		deletePost: (slug) =>
			call<void>('DELETE', `/admin/posts/${encodeURIComponent(slug)}`, { op: 'posts.delete' }),

		// --- photos (§8 + §5 relay) ---
		listPhotos: (o?: PhotoListOpts) =>
			call<Paged<AdminPhoto>>('GET', '/admin/photos', {
				op: 'photos.list',
				query: q({
					collection: o?.collections,
					q: o?.q,
					gallery: o?.gallery === undefined ? undefined : o.gallery ? '1' : '0',
					from: o?.from,
					to: o?.to,
					sort: o?.sort,
					dir: o?.dir,
					page: o?.page
				})
			}),
		addPhoto: async (p) => {
			const requestId = newRequestId();
			const hop = upstreamFor('/admin/photos');
			const dep = DEP[hop];
			// the shared response leg — both wire shapes converge here: the
			// access line, the error copy (lumen's verbatim), the JSON photo
			const settle = async (res: Response): Promise<AdminPhoto> => {
				logAccess(hop, 'POST', '/admin/photos', res.status, echoedRequestId(res, requestId));
				const text = await res.text();
				if (!res.ok) {
					throw new AdminApiError(
						res.status,
						safeError(text, `HTTP ${res.status}`),
						echoedRequestId(res, requestId)
					);
				}
				return JSON.parse(text) as AdminPhoto;
			};
			// the relay's shape: the browser's multipart request streams through
			// VERBATIM — no parse, no buffer (the 100 MB path). Node 22 requires
			// `duplex: 'half'` for stream bodies; RequestInit's types don't know it.
			if ('body' in p) {
				let res: Response;
				try {
					res = await outbound(dep, 'photos.upload', (signal) =>
						fetch(new URL(at('/admin/photos')), {
							method: 'POST',
							signal,
							headers: {
								Authorization: `Bearer ${bearer}`,
								[REQUEST_ID_HEADER]: requestId,
								'content-type': p.contentType
							},
							body: p.body,
							duplex: 'half'
						} as RequestInit)
					);
				} catch {
					logAccess(hop, 'POST', '/admin/photos', 'unreachable', requestId);
					throw new AdminApiError(503, 'lumen unreachable', requestId);
				}
				return settle(res);
			}
			// the browser's shape: wrap the bytes in the multipart lumen expects —
			// photo + optional exif ONLY. Dims are not on the wire: lumen decodes
			// the bytes and the response carries truth (the §5 probe is the authority)
			const form = new FormData();
			form.append('photo', p.file, p.name);
			// the EXIF capture (Round B): client-side, BEFORE upload — lumen
			// allowlists what it stores; absent = the field ships not at all
			if (p.exif) form.append('exif', JSON.stringify(p.exif));
			let res: Response;
			try {
				// COUNTED + BOUNDED like every call: the upload is the ONE slow
				// op by nature (multi-MB bodies) — it gets the table's
				// photos.upload budget, everything else rides the dep default
				res = await outbound(dep, 'photos.upload', (signal) =>
					fetch(new URL(at('/admin/photos')), {
						method: 'POST',
						signal,
						headers: { Authorization: `Bearer ${bearer}`, [REQUEST_ID_HEADER]: requestId },
						body: form
					})
				);
			} catch {
				logAccess(hop, 'POST', '/admin/photos', 'unreachable', requestId);
				throw new AdminApiError(503, 'lumen unreachable', requestId);
			}
			return settle(res);
		},
		updatePhoto: (id, patch: { alt?: string; collection?: string | null; gallery?: boolean }) =>
			call<AdminPhoto>('PATCH', `/admin/photos/${encodeURIComponent(id)}`, {
				op: 'photos.update',
				// collection: null must ship as JSON null (clears the bucket);
				// undefined fields drop (absent = untouched) — stringify does both
				body: patch
			}),
		getPhoto: (id) =>
			call<AdminPhoto>('GET', `/admin/photos/${encodeURIComponent(id)}`, { op: 'photos.read' }),
		listPhotoReferences: (id) =>
			call<{ slug: string; title: string }[]>(
				'GET',
				`/admin/photos/${encodeURIComponent(id)}/references`,
				{ op: 'photos.references' }
			),
		deletePhoto: (id) =>
			call<void>('DELETE', `/admin/photos/${encodeURIComponent(id)}`, { op: 'photos.delete' }),

		// --- vocabulary (§8) ---
		listCollections: () =>
			call<CollectionCount[]>('GET', '/admin/collections', { op: 'collections.list' }),
		createCollection: (name) =>
			call<CollectionCount>('POST', '/admin/collections', {
				op: 'collections.create',
				body: { name }
			}),
		listTags: () => call<TagCount[]>('GET', '/admin/tags', { op: 'tags.list' }),
		listNewestTags: () =>
			call<TagCount[]>('GET', '/admin/tags', { op: 'tags.newest', query: { order: ['newest'] } }),
		searchTags: (needle, page, pageSize) =>
			call<Paged<TagCount>>('GET', '/admin/tags/search', {
				op: 'tags.search',
				query: q({ q: needle, page, pageSize })
			}),
		bulkFeatureTags: (names, featured) =>
			call<{ updated: number }>('PATCH', '/admin/tags/bulk', {
				op: 'tags.bulk',
				body: { names, featured }
			}).then((r) => r.updated),
		createTag: (name) =>
			call<TagCount>('POST', '/admin/tags', { op: 'tags.create', body: { name } }),
		updateTag: (name, patch) =>
			call<TagCount>('PATCH', `/admin/tags/${enc(name)}`, { op: 'tags.update', body: patch }),
		deleteTag: (name) => call<void>('DELETE', `/admin/tags/${enc(name)}`, { op: 'tags.delete' }),

		// --- palette content door (§8) ---
		search: (needle) =>
			call<SearchResults>('GET', '/admin/search', { op: 'search.query', query: { q: [needle] } }),

		// --- secrets plane (§9) ---
		listSecretPaths: () => call<SecretPath[]>('GET', '/admin/bao/paths', { op: 'bao.paths' }),
		readSecret: (app, env, version) =>
			call<SecretPayload | null>('GET', `/admin/bao/${enc(app)}/${enc(env)}`, {
				op: 'bao.read',
				query: version ? { version: [String(version)] } : undefined,
				nullOn404: true
			}),
		secretMeta: (app, env) =>
			call<SecretMeta | null>('GET', `/admin/bao/${enc(app)}/${enc(env)}`, {
				op: 'bao.meta',
				query: { meta: [''] },
				nullOn404: true
			}),
		writeSecret: (app, env, data, cas) =>
			call<{ version: number }>('PUT', `/admin/bao/${enc(app)}/${enc(env)}`, {
				op: 'bao.write',
				body: { data, cas }
			}).then((r) => r.version),
		onboardApp: (app, envs) =>
			call<{ app: string; envs: string[] }>('POST', '/admin/bao/apps', {
				op: 'bao.onboard',
				body: envs?.length ? { app, envs } : { app }
			}),
		addEnv: (app, env) =>
			call<{ app: string; env: string }>('POST', `/admin/bao/${enc(app)}/envs`, {
				op: 'bao.add-env',
				body: { env }
			}),
		pinSecret: (app, env, version) =>
			call<{ pinnedVersion: number }>('PUT', `/admin/bao/${enc(app)}/${enc(env)}/pin`, {
				op: 'bao.pin',
				body: { version }
			}),
		unpinSecret: (app, env) =>
			call<void>('DELETE', `/admin/bao/${enc(app)}/${enc(env)}/pin`, { op: 'bao.unpin' }),
		estateSummary: () => call<EstateRow[]>('GET', '/admin/bao/summary', { op: 'bao.summary' }),

		// --- tasks (lumen internal/tasks, M2 wire) ---
		// Every path is admin-plane (routing.ts), every call is counted under
		// its own enumerated op, and the two day-sensitive reads carry the
		// caller's IANA zone; lumen validates it and falls back to UTC.
		tasksWorkspace: ({ view, projectId, timezone }) =>
			call<TaskWorkspace>('GET', '/admin/tasks', {
				op: 'tasks.workspace',
				query: q({ view, project: projectId }),
				headers: timezoneHeaders(timezone)
			}),
		taskStats: (timezone) =>
			call<{ stats: TaskStats }>('GET', '/admin/task-stats', {
				op: 'tasks.stats',
				headers: timezoneHeaders(timezone)
			}).then((r) => r.stats),
		taskProjectCreate: (name) =>
			call<{ project: TaskProject }>('POST', '/admin/task-projects', {
				op: 'tasks.projects.create',
				body: { name }
			}).then((r) => r.project),
		taskProjectRename: (id, name) =>
			call<{ ok: true }>('PATCH', `/admin/task-projects/${enc(id)}`, {
				op: 'tasks.projects.rename',
				body: { name }
			}).then(() => undefined),
		taskProjectComplete: (id, completed) =>
			call<{ ok: true; completed: boolean }>('POST', `/admin/task-projects/${enc(id)}/complete`, {
				op: 'tasks.projects.complete',
				body: { completed }
			}).then((r) => r.completed),
		taskProjectDelete: (id) =>
			call<void>('DELETE', `/admin/task-projects/${enc(id)}`, {
				op: 'tasks.projects.delete'
			}),
		taskMembers: (id) =>
			call<{ members: TaskMember[] }>('GET', `/admin/task-projects/${enc(id)}/members`, {
				op: 'tasks.members.list'
			}).then((r) => r.members),
		taskMemberRole: (id, userId, role) =>
			call<{ ok: true }>('POST', `/admin/task-projects/${enc(id)}/members/${enc(userId)}/role`, {
				op: 'tasks.members.role',
				body: { role }
			}).then(() => undefined),
		taskMemberRemove: (id, userId) =>
			call<void>('DELETE', `/admin/task-projects/${enc(id)}/members/${enc(userId)}`, {
				op: 'tasks.members.remove'
			}),
		taskInviteCreate: (projectId, username) =>
			call<{ invite: TaskInvite }>('POST', `/admin/task-projects/${enc(projectId)}/invites`, {
				op: 'tasks.invites.create',
				body: { username }
			}).then((r) => r.invite),
		taskInviteeSearch: (projectId, query) =>
			call<{ people: TaskPerson[] }>(
				'GET',
				`/admin/task-projects/${enc(projectId)}/people?q=${encodeURIComponent(query)}`,
				{ op: 'tasks.invitees.search' }
			).then((r) => r.people),
		taskInvites: () =>
			call<{ invites: TaskInvite[] }>('GET', '/admin/task-invites', {
				op: 'tasks.invites.list'
			}).then((r) => r.invites),
		taskInviteAccept: (id) =>
			call<{ invite: TaskInvite }>('POST', `/admin/task-invites/${enc(id)}/accept`, {
				op: 'tasks.invites.accept'
			}).then((r) => r.invite),
		taskInviteDecline: (id) =>
			call<void>('POST', `/admin/task-invites/${enc(id)}/decline`, {
				op: 'tasks.invites.decline'
			}),
		taskInviteRevoke: (projectId, inviteId) =>
			call<void>('DELETE', `/admin/task-projects/${enc(projectId)}/invites/${enc(inviteId)}`, {
				op: 'tasks.invites.revoke'
			}),
		taskCreate: (input: TaskCreateInput) =>
			call<{ task: TaskItem }>('POST', '/admin/tasks', {
				op: 'tasks.create',
				body: input
			}).then((r) => r.task),
		taskGet: (id) => call<TaskDetail>('GET', `/admin/tasks/${enc(id)}`, { op: 'tasks.read' }),
		taskUpdate: (id, patch: TaskPatchInput) =>
			call<{ task: TaskItem }>('PATCH', `/admin/tasks/${enc(id)}`, {
				op: 'tasks.update',
				body: taskPatchBody(patch)
			}).then((r) => r.task),
		taskToggle: (id) =>
			call<{ task: TaskItem }>('POST', `/admin/tasks/${enc(id)}/toggle`, {
				op: 'tasks.toggle'
			}).then((r) => r.task),
		taskDelete: (id) => call<void>('DELETE', `/admin/tasks/${enc(id)}`, { op: 'tasks.delete' }),
		taskSubtaskCreate: (taskId, title) =>
			call<{ subtask: TaskSubtask }>('POST', `/admin/tasks/${enc(taskId)}/subtasks`, {
				op: 'tasks.subtasks.create',
				body: { title }
			}).then((r) => r.subtask),
		taskSubtaskUpdate: (taskId, subtaskId, patch) =>
			call<{ subtask: TaskSubtask }>(
				'PATCH',
				`/admin/tasks/${enc(taskId)}/subtasks/${enc(subtaskId)}`,
				{ op: 'tasks.subtasks.update', body: subtaskPatchBody(patch) }
			).then((r) => r.subtask),
		taskSubtaskDelete: (taskId, subtaskId) =>
			call<void>('DELETE', `/admin/tasks/${enc(taskId)}/subtasks/${enc(subtaskId)}`, {
				op: 'tasks.subtasks.delete'
			}),
		taskCommentCreate: (taskId, body) =>
			call<{ comment: TaskComment }>('POST', `/admin/tasks/${enc(taskId)}/comments`, {
				op: 'tasks.comments.create',
				body: { body }
			}).then((r) => r.comment),
		taskCommentDelete: (taskId, commentId) =>
			call<void>('DELETE', `/admin/tasks/${enc(taskId)}/comments/${enc(commentId)}`, {
				op: 'tasks.comments.delete'
			}),

		// --- notifications (the bell; the send door is NOT a portal verb) ---
		notifications: ({ unread, before, limit, env } = {}) =>
			call<NotificationPage>('GET', '/admin/notifications', {
				op: 'notifications.list',
				query: q({
					unread: unread === undefined ? undefined : unread ? 'true' : 'false',
					before,
					limit,
					env
				})
			}),
		notificationsUnreadCount: (env) =>
			call<{ count: number }>('GET', '/admin/notifications/unread-count', {
				op: 'notifications.count',
				query: q({ env })
			}).then((r) => r.count),
		notificationMarkRead: (id) =>
			call<void>('POST', `/admin/notifications/${enc(id)}/read`, {
				op: 'notifications.read'
			}),
		notificationsMarkAllRead: (env) =>
			call<{ updated: number }>('POST', '/admin/notifications/read-all', {
				op: 'notifications.read-all',
				query: q({ env })
			}).then((r) => r.updated)
	};
}

function enc(s: string): string {
	return encodeURIComponent(s);
}

/** The tasks day-math header: only a non-empty zone ships (lumen falls back
 *  to UTC on absence/malformed input — the header is not a credential). */
function timezoneHeaders(timezone?: string): Record<string, string> | undefined {
	const zone = timezone?.trim();
	return zone ? { 'X-Client-Timezone': zone } : undefined;
}

/** The tasks PATCH's three-way presence, made explicit: an ABSENT key ships
 *  not at all (leave the field), an explicit null SHIPS (clear dueAt /
 *  unassign), and a value sets it. JSON.stringify happens to honour the same
 *  rule, but building the body makes the intent unmissable and keeps a
 *  caller's `undefined` from becoming a phantom key. */
function taskPatchBody(patch: TaskPatchInput): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (patch.title !== undefined) body.title = patch.title;
	if (patch.notes !== undefined) body.notes = patch.notes;
	if (patch.priority !== undefined) body.priority = patch.priority;
	if (patch.dueAt !== undefined) body.dueAt = patch.dueAt;
	if (patch.assignedTo !== undefined) body.assignedTo = patch.assignedTo;
	return body;
}

function subtaskPatchBody(patch: { title?: string; done?: boolean }): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (patch.title !== undefined) body.title = patch.title;
	if (patch.done !== undefined) body.done = patch.done;
	return body;
}

function safeError(text: string, fallback: string): string {
	try {
		const j = JSON.parse(text) as { error?: string };
		return j.error ?? fallback;
	} catch {
		return fallback;
	}
}
