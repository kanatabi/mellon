/**
 * pending-edit.ts — the editor's pending-change store: the port that keeps
 * local autosave swappable for a future lumen working-copy (the parked
 * posture in DESIGN §10) without touching the UI. The editor, the restore
 * banner, the save-confirm dialog and the diff page consume ONLY the
 * `PostEditStore` interface — a server-side autosave phase replaces the
 * localStorage adapter (and the diff page's pending source) and nothing
 * else. The payload shape is deliberately the proposed wire shape:
 * a working copy would PUT `{ draft, baseRev }`.
 *
 * Everything here is pure and offline-testable (storage injected), like the
 * rest of the house.
 */
import type { PostDraft } from './api/types.ts';

/**
 * A pending edit: a full draft snapshot forked from head at `baseRev`.
 * `baseRev` is THE versioning primitive — today the CAS revision the local
 * buffer forked from; tomorrow the working copy's base for a versioned head.
 * `slug: NEW_POST_BUFFER` marks the unsaved create-mode buffer (a real post
 * can never own it: /posts/new is the create route itself).
 */
export interface PendingEdit {
	slug: string;
	baseRev: number;
	/** Epoch ms of the last write — the restore banner's timestamp. */
	at: number;
	draft: PostDraft;
}

export const NEW_POST_BUFFER = 'new-post';

export function bufferKey(slug: string): string {
	return `mellon.editor-buffer.${slug}`;
}

export interface PostEditStore {
	read(slug: string): Promise<PendingEdit | null>;
	write(edit: PendingEdit): Promise<void>;
	clear(slug: string): Promise<void>;
}

/** The V1 adapter: browser localStorage, injected so tests never touch a DOM. */
export function localStoragePostEditStore(
	storage: Storage = globalThis.localStorage
): PostEditStore {
	return {
		async read(slug) {
			try {
				const raw = storage.getItem(bufferKey(slug));
				if (!raw) return null;
				const parsed = JSON.parse(raw) as PendingEdit;
				// Shape guard: a corrupt or foreign entry is NO buffer, never a crash.
				if (!parsed || typeof parsed.baseRev !== 'number' || !parsed.draft) return null;
				return parsed;
			} catch {
				return null;
			}
		},
		async write(edit) {
			storage.setItem(bufferKey(edit.slug), JSON.stringify(edit));
		},
		async clear(slug) {
			storage.removeItem(bufferKey(slug));
		}
	};
}

/** The autosave knob's whole semantics: the buffer never lags live typing
 *  more than this many seconds — idle debounce AND max-staleness bound in
 *  one number (EDITOR_AUTOSAVE_SECONDS, seeded at kv/mellon/shared). */
export const AUTOSAVE_DEFAULT_SECONDS = 60;

export function parseAutosaveSeconds(raw: string | undefined | null): number {
	const n = Number(raw);
	// Missing/garbage/out-of-range all land on the default — an operator typo
	// must never collapse the cadence to a surprise 1s flush.
	if (!raw || !Number.isInteger(n) || n < 1 || n > 3600) return AUTOSAVE_DEFAULT_SECONDS;
	return n;
}

export interface EditScheduler {
	/** Call after every edit burst member — (re)arms the idle timer. */
	schedule(): void;
	/** Write NOW when a write is pending (the pagehide flush). */
	flush(): void;
	/** Drop pending timers WITHOUT writing (post-save cancel). */
	stop(): void;
}

/**
 * The staleness machine, decoupled from storage: writes `current()` through
 * the store N seconds after the last edit (idle), and — while typing never
 * pauses — at N-second intervals from the first unsaved edit (max-wait), so
 * continuous editing cannot starve the buffer. `current()` returning null
 * (clean editor) makes every timer a no-op.
 */
export function createEditScheduler(opts: {
	seconds: number;
	current: () => PendingEdit | null;
	store: PostEditStore;
}): EditScheduler {
	const idleMs = Math.max(1, opts.seconds) * 1000;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let staleTimer: ReturnType<typeof setTimeout> | undefined;
	let firstAt: number | null = null;

	function fire() {
		clearTimeout(idleTimer);
		clearTimeout(staleTimer);
		idleTimer = staleTimer = undefined;
		firstAt = null;
		const edit = opts.current();
		if (edit) void opts.store.write(edit);
	}

	return {
		schedule() {
			if (!opts.current()) return;
			clearTimeout(idleTimer);
			idleTimer = setTimeout(fire, idleMs);
			const now = Date.now();
			if (firstAt === null) {
				firstAt = now;
				clearTimeout(staleTimer);
				staleTimer = setTimeout(fire, idleMs);
			}
		},
		flush() {
			if (idleTimer !== undefined || firstAt !== null) fire();
		},
		stop() {
			clearTimeout(idleTimer);
			clearTimeout(staleTimer);
			idleTimer = staleTimer = undefined;
			firstAt = null;
		}
	};
}

/** Draft equality (tags order-insensitive) — decides whether a stored buffer
 *  still describes work the editor doesn't have. */
export function sameDraft(a: PostDraft, b: PostDraft): boolean {
	const stable = (d: PostDraft) => JSON.stringify({ ...d, tags: [...d.tags].sort() });
	return stable(a) === stable(b);
}
