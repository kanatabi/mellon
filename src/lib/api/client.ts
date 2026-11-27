/**
 * Browser-side AdminApi client — same interface as the server layer, calling
 * mellon's `/api/*` surface. The UI imports ONLY this; whether the handler
 * behind it resolves from mock (today) or relays to lumen (Phase B) is
 * invisible up the stack — the whole point of the relay doctrine.
 */
import type {
	AdminUserRow,
	CatalogEntry,
	Principal,
	ScopeAssignment,
	AdminApi,
	LoginResponse,
	AdminPhoto,
	CollectionCount,
	EstateRow,
	Paged,
	PostDetailAdmin,
	PostStatus,
	PostSummaryAdmin,
	SecretMeta,
	SecretPath,
	SecretPayload,
	TagCount,
	SearchResults,
	NotificationPage,
	NotificationQuery,
	TaskComment,
	TaskCreateInput,
	TaskDetail,
	TaskInvite,
	TaskItem,
	TaskMember,
	TaskPatchInput,
	TaskProject,
	TaskStats,
	TaskSubtask,
	TaskWorkspace
} from './types.ts';
import { MAX_UPLOAD_BYTES } from '#lib/upload.ts';

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/**
 * Verbatim surface for RELAYED server errors (the ghost-field lesson, made
 * structural): the message an ApiError carries IS lumen's copy, shipped
 * byte-for-byte through the relay — 409 conflict stories, the 403 pin
 * write-lock refusal ("pinned at v<N> — unpin first"), all of it. Decorate
 * or stringify only NON-API failures; an `ApiError: ` prefix in the UI means
 * we dressed up someone else's truth.
 */
export function errorText(e: unknown): string {
	return e instanceof ApiError ? e.message : String(e);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
	// JSON is the default dialect — but a FormData body must set its OWN
	// content-type (the browser stamps the multipart boundary; an explicit
	// JSON header here would strip it), and extra headers (the tasks
	// X-Client-Timezone) ride every shape.
	const headers = new Headers(init?.headers);
	if (init?.body && !(init.body instanceof FormData))
		headers.set('content-type', 'application/json');
	const res = await fetch(`/api${path}`, { ...init, headers });
	const text = await res.text();
	if (!res.ok) {
		let message = `request failed (${res.status})`;
		try {
			const body = JSON.parse(text) as { error?: string };
			if (body.error) message = body.error;
		} catch {
			/* non-JSON error body: the status line is the message */
		}
		throw new ApiError(res.status, message);
	}
	// 204 No Content (the delete verbs) carries no body — res.json() would throw
	return (text ? JSON.parse(text) : undefined) as T;
}

/** The tasks day-math header's default: the browser's IANA zone. The
 *  server adapter takes the zone from its caller; here Intl is the honest
 *  source (no cookie mechanism this round). */
function localTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
	} catch {
		return '';
	}
}

function timezoneHeaders(timezone?: string): Record<string, string> {
	const zone = timezone?.trim() || localTimezone();
	return zone ? { 'X-Client-Timezone': zone } : {};
}

/** The tasks PATCH's three-way presence: an absent key must not become a
 *  JSON key, while an explicit null must ship (clear dueAt / unassign).
 *  Built explicitly — JSON.stringify drops `undefined` anyway, but the
 *  intent is the contract and a reviewer should not have to know that. */
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

export const client: AdminApi = {
	login: () => {
		// Session minting is the /login form action (server-side cookie). Present
		// only to satisfy the interface; never callable meaningfully here.
		throw new ApiError(500, 'login is served by the form action, not the browser client');
	},
	// ---- the passkey round (C1): the FIRST browser-callable methods —
	// the same-origin relay carries the session cookie for the authed
	// surfaces; the WebAuthn dance stays in #lib/webauthn.client.ts ----
	authMethods: () => call<{ methods: string[] }>('/admin/session/auth/methods'),
	passkeyLoginBegin: () =>
		call<{ state: string; options: unknown }>('/admin/session/webauthn/login/begin'),
	passkeyLoginFinish: (state, response) =>
		call<LoginResponse>('/admin/session/webauthn/login/finish', {
			method: 'POST',
			body: JSON.stringify({ state, response })
		}),
	passkeyRegisterBegin: () =>
		call<{ state: string; options: unknown }>('/admin/session/webauthn/register/begin'),
	passkeyRegisterFinish: (state, label, response) =>
		call<{ passkey: { id: string; label: string; createdAt: string } }>(
			'/admin/session/webauthn/register/finish',
			{ method: 'POST', body: JSON.stringify({ state, label, response }) }
		),
	passkeys: () =>
		call<{ passkeys: { id: string; label: string; createdAt: string; lastUsedAt: string }[] }>(
			'/admin/session/webauthn'
		),
	passkeyDelete: (id) =>
		call<void>(`/admin/session/webauthn/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	setupStatus: () => call<{ unclaimed: boolean }>('/setup'),
	registerFirstAdmin: () => {
		throw new ApiError(500, 'setup registration is served by the /setup form action');
	},
	whoami: () => call<Principal>('/session'),
	changePassword: () => {
		throw new ApiError(500, 'password change is served by the /setup form action');
	},
	listUsers: () => call<AdminUserRow[]>('/users'),
	createUser: (username, scopes) =>
		call<AdminUserRow & { tempPassword: string }>('/users', {
			method: 'POST',
			body: JSON.stringify({ username, scopes })
		}),
	updateUserScopes: (username, scopes) =>
		call<ScopeAssignment>(`/users/${encodeURIComponent(username)}/scopes`, {
			method: 'PATCH',
			body: JSON.stringify({ scopes })
		}),
	revokeSessions: (username) =>
		call<ScopeAssignment>(`/users/${encodeURIComponent(username)}/revoke-sessions`, {
			method: 'POST',
			body: '{}'
		}),
	forcePasswordChange: (username) =>
		call<{ username: string; mustChange: boolean }>(
			`/users/${encodeURIComponent(username)}/force-change`,
			{ method: 'POST', body: '{}' }
		),
	setUserDisabled: (username, disabled) =>
		call<ScopeAssignment>(
			`/users/${encodeURIComponent(username)}/${disabled ? 'disable' : 'enable'}`,
			{
				method: 'POST',
				body: '{}'
			}
		),
	deleteUser: (username) =>
		call<void>(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),
	listScopes: () => call<CatalogEntry[]>('/scopes'),
	addScope: (scope, description) =>
		call<CatalogEntry>('/scopes', {
			method: 'POST',
			body: JSON.stringify({ scope, description })
		}),
	deleteScope: (scope) => call<void>(`/scopes/${encodeURIComponent(scope)}`, { method: 'DELETE' }),
	resetUserPassword: (username) =>
		call<{ tempPassword: string }>(`/users/${encodeURIComponent(username)}/reset-password`, {
			method: 'POST',
			body: '{}'
		}),
	logout: () => {
		// symmetric with login: end-session is the /logout server action — the
		// browser never learns the token, and never revokes with it either
		throw new ApiError(500, 'logout is served by the /logout action, not the browser client');
	},

	listPosts: (opts) => {
		const params = new URLSearchParams();
		if (opts?.status) params.set('status', opts.status);
		for (const t of opts?.tag ?? []) params.append('tag', t);
		if (opts?.q) params.set('q', opts.q);
		if (opts?.from) params.set('from', opts.from);
		if (opts?.to) params.set('to', opts.to);
		if (opts?.sort) params.set('sort', opts.sort);
		if (opts?.dir) params.set('dir', opts.dir);
		if (opts?.page) params.set('page', String(opts.page));
		const qs = params.toString();
		return call<Paged<PostSummaryAdmin>>(`/posts${qs ? `?${qs}` : ''}`);
	},
	getPost: (slug) => call<PostDetailAdmin>(`/posts/${slug}`),
	createPost: (draft) =>
		call<PostDetailAdmin>('/posts', { method: 'POST', body: JSON.stringify(draft) }),
	updatePost: (slug, draft, rev) =>
		call<PostDetailAdmin>(`/posts/${slug}`, {
			method: 'PUT',
			body: JSON.stringify({ draft, rev })
		}),
	publishPost: (slug) => call<PostDetailAdmin>(`/posts/${slug}/publish`, { method: 'POST' }),
	unpublishPost: (slug) => call<PostDetailAdmin>(`/posts/${slug}/unpublish`, { method: 'POST' }),
	deletePost: (slug) =>
		call<{ ok: true }>(`/posts/${slug}`, { method: 'DELETE' }).then(() => undefined),

	listPhotos: (opts) => {
		const params = new URLSearchParams();
		for (const c of opts?.collections ?? []) params.append('collection', c);
		if (opts?.q) params.set('q', opts.q);
		if (opts?.gallery !== undefined) params.set('gallery', opts.gallery ? '1' : '0');
		if (opts?.from) params.set('from', opts.from);
		if (opts?.to) params.set('to', opts.to);
		if (opts?.sort) params.set('sort', opts.sort);
		if (opts?.dir) params.set('dir', opts.dir);
		if (opts?.page) params.set('page', String(opts.page));
		const qs = params.toString();
		return call<Paged<AdminPhoto>>(`/photos${qs ? `?${qs}` : ''}`);
	},
	addPhoto: (p) => {
		// the stream shape is the RELAY's verb — the browser never holds one
		if ('body' in p) throw new ApiError(500, 'stream uploads are a server-side concern');
		// ask before reading: lumen 413s the same cap, and a doomed 100 MB
		// upload should die here, not after the wire
		if (p.file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'over the 100 MB limit');
		const form = new FormData();
		form.append('photo', p.file, p.name);
		// the EXIF capture (Round B): client-side, BEFORE upload — lumen
		// allowlists what it stores; absent = the field ships not at all
		if (p.exif) form.append('exif', JSON.stringify(p.exif));
		return call<AdminPhoto>('/photos', { method: 'POST', body: form });
	},
	updatePhoto: (id, patch) =>
		call<AdminPhoto>(`/photos/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
	getPhoto: (id) => call<AdminPhoto>(`/photos/${id}`),
	listPhotoReferences: (id) => call<{ slug: string; title: string }[]>(`/photos/${id}/references`),
	deletePhoto: (id) =>
		call<{ ok: true }>(`/photos/${id}`, { method: 'DELETE' }).then(() => undefined),

	listCollections: () => call<CollectionCount[]>('/collections'),
	createCollection: (name) =>
		call<CollectionCount>('/collections', { method: 'POST', body: JSON.stringify({ name }) }),

	listTags: () => call<TagCount[]>('/tags'),
	listNewestTags: () => call<TagCount[]>('/tags?order=newest'),
	searchTags: (q, page, pageSize) => {
		const params = new URLSearchParams({ q });
		if (page) params.set('page', String(page));
		if (pageSize) params.set('pageSize', String(pageSize));
		return call<Paged<TagCount>>(`/tags/search?${params.toString()}`);
	},
	bulkFeatureTags: (names, featured) =>
		call<{ updated: number }>('/tags/bulk', {
			method: 'PATCH',
			body: JSON.stringify({ names, featured })
		}).then((r) => r.updated),
	search: (q) => call<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
	createTag: (name) => call<TagCount>('/tags', { method: 'POST', body: JSON.stringify({ name }) }),
	updateTag: (name, patch) =>
		call<TagCount>(`/tags/${name}`, { method: 'PATCH', body: JSON.stringify(patch) }),
	deleteTag: (name) => call(`/tags/${name}`, { method: 'DELETE' }),

	listSecretPaths: () => call<SecretPath[]>('/secrets'),
	readSecret: (app, env, version) =>
		call<SecretPayload | null>(`/secrets/${app}/${env}${version ? `?version=${version}` : ''}`),
	secretMeta: (app, env) => call<SecretMeta | null>(`/secrets/${app}/${env}?meta`),
	writeSecret: (app, env, data, cas) =>
		call<{ version: number }>(`/secrets/${app}/${env}`, {
			method: 'PUT',
			body: JSON.stringify({ data, cas })
		}).then((r) => r.version),
	onboardApp: (app, envs) =>
		call<{ app: string; envs: string[] }>('/secrets/apps', {
			method: 'POST',
			body: JSON.stringify(envs?.length ? { app, envs } : { app })
		}),
	addEnv: (app, env) =>
		call<{ app: string; env: string }>(`/secrets/${app}/envs`, {
			method: 'POST',
			body: JSON.stringify({ env })
		}),
	pinSecret: (app, env, version) =>
		call<{ pinnedVersion: number }>(`/secrets/${app}/${env}/pin`, {
			method: 'PUT',
			body: JSON.stringify({ version })
		}),
	unpinSecret: (app, env) => call(`/secrets/${app}/${env}/pin`, { method: 'DELETE' }),
	estateSummary: () => call<EstateRow[]>('/secrets/summary'),

	// ---- tasks (the same-origin relay under /api/...) ----
	tasksWorkspace: ({ view, projectId, timezone }) => {
		const params = new URLSearchParams({ view });
		if (projectId) params.set('project', projectId);
		return call<TaskWorkspace>(`/tasks?${params.toString()}`, {
			headers: timezoneHeaders(timezone)
		});
	},
	taskStats: (timezone) =>
		call<{ stats: TaskStats }>('/task-stats', {
			headers: timezoneHeaders(timezone)
		}).then((r) => r.stats),
	taskProjectCreate: (name) =>
		call<{ project: TaskProject }>('/task-projects', {
			method: 'POST',
			body: JSON.stringify({ name })
		}).then((r) => r.project),
	taskProjectRename: (id, name) =>
		call<{ ok: true }>(`/task-projects/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify({ name })
		}).then(() => undefined),
	taskProjectComplete: (id, completed) =>
		call<{ ok: true; completed: boolean }>(`/task-projects/${encodeURIComponent(id)}/complete`, {
			method: 'POST',
			body: JSON.stringify({ completed })
		}).then((r) => r.completed),
	taskProjectDelete: (id) =>
		call<void>(`/task-projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	taskMembers: (id) =>
		call<{ members: TaskMember[] }>(`/task-projects/${encodeURIComponent(id)}/members`).then(
			(r) => r.members
		),
	taskMemberRole: (id, userId, role) =>
		call<{ ok: true }>(
			`/task-projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/role`,
			{ method: 'POST', body: JSON.stringify({ role }) }
		).then(() => undefined),
	taskMemberRemove: (id, userId) =>
		call<void>(`/task-projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
			method: 'DELETE'
		}),
	taskInviteCreate: (projectId, username) =>
		call<{ invite: TaskInvite }>(`/task-projects/${encodeURIComponent(projectId)}/invites`, {
			method: 'POST',
			body: JSON.stringify({ username })
		}).then((r) => r.invite),
	taskInvites: () => call<{ invites: TaskInvite[] }>('/task-invites').then((r) => r.invites),
	taskInviteAccept: (id) =>
		call<{ invite: TaskInvite }>(`/task-invites/${encodeURIComponent(id)}/accept`, {
			method: 'POST'
		}).then((r) => r.invite),
	taskInviteDecline: (id) =>
		call<void>(`/task-invites/${encodeURIComponent(id)}/decline`, { method: 'POST' }),
	taskInviteRevoke: (projectId, inviteId) =>
		call<void>(
			`/task-projects/${encodeURIComponent(projectId)}/invites/${encodeURIComponent(inviteId)}`,
			{ method: 'DELETE' }
		),
	taskCreate: (input: TaskCreateInput) =>
		call<{ task: TaskItem }>('/tasks', {
			method: 'POST',
			body: JSON.stringify(input)
		}).then((r) => r.task),
	taskGet: (id) => call<TaskDetail>(`/tasks/${encodeURIComponent(id)}`),
	taskUpdate: (id, patch: TaskPatchInput) =>
		call<{ task: TaskItem }>(`/tasks/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify(taskPatchBody(patch))
		}).then((r) => r.task),
	taskToggle: (id) =>
		call<{ task: TaskItem }>(`/tasks/${encodeURIComponent(id)}/toggle`, {
			method: 'POST'
		}).then((r) => r.task),
	taskDelete: (id) => call<void>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	taskSubtaskCreate: (taskId, title) =>
		call<{ subtask: TaskSubtask }>(`/tasks/${encodeURIComponent(taskId)}/subtasks`, {
			method: 'POST',
			body: JSON.stringify({ title })
		}).then((r) => r.subtask),
	taskSubtaskUpdate: (taskId, subtaskId, patch) =>
		call<{ subtask: TaskSubtask }>(
			`/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`,
			{ method: 'PATCH', body: JSON.stringify(subtaskPatchBody(patch)) }
		).then((r) => r.subtask),
	taskSubtaskDelete: (taskId, subtaskId) =>
		call<void>(`/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`, {
			method: 'DELETE'
		}),
	taskCommentCreate: (taskId, body) =>
		call<{ comment: TaskComment }>(`/tasks/${encodeURIComponent(taskId)}/comments`, {
			method: 'POST',
			body: JSON.stringify({ body })
		}).then((r) => r.comment),
	taskCommentDelete: (taskId, commentId) =>
		call<void>(`/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`, {
			method: 'DELETE'
		}),

	// ---- notifications (the bell; never the send door) ----
	notifications: ({ unread, before, limit }: NotificationQuery = {}) => {
		const params = new URLSearchParams();
		if (unread !== undefined) params.set('unread', unread ? 'true' : 'false');
		if (before) params.set('before', before);
		if (limit !== undefined) params.set('limit', String(limit));
		const qs = params.toString();
		return call<NotificationPage>(`/notifications${qs ? `?${qs}` : ''}`);
	},
	notificationsUnreadCount: () =>
		call<{ count: number }>('/notifications/unread-count').then((r) => r.count),
	notificationMarkRead: (id) =>
		call<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
	notificationsMarkAllRead: () =>
		call<{ updated: number }>('/notifications/read-all', { method: 'POST' }).then((r) => r.updated)
};

export async function preview(
	md: string
): Promise<{ html: string; toc: { id: string; text: string; depth: 2 | 3 }[] }> {
	return call('/preview', { method: 'POST', body: JSON.stringify({ md }) });
}

export type { PostStatus };
