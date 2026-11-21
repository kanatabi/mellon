import { describe, expect, it, vi } from 'vitest';
import {
	AUTOSAVE_DEFAULT_SECONDS,
	bufferKey,
	createEditScheduler,
	localStoragePostEditStore,
	parseAutosaveSeconds,
	sameDraft,
	type PendingEdit
} from './pending-edit.ts';
import type { PostDraft } from './api/types.ts';

const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
	slug: 'a-post',
	title: 'A post',
	subtitle: '',
	preview: '',
	date: '2026-11-21',
	tags: [],
	content: 'body',
	thumbnail: null,
	...over
});

const edit = (over: Partial<PendingEdit> = {}): PendingEdit => ({
	slug: 'a-post',
	baseRev: 3,
	at: 1700000000000,
	draft: draft(),
	...over
});

function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => void map.set(k, v),
		removeItem: (k) => void map.delete(k),
		clear: () => map.clear(),
		key: (i) => [...map.keys()][i] ?? null,
		get length() {
			return map.size;
		}
	} as Storage;
}

describe('parseAutosaveSeconds', () => {
	it('defaults on missing, garbage, and out-of-range input (never a surprise 1s)', () => {
		for (const bad of [undefined, null, '', '  ', 'abc', '4.5', '0', '-5', '3601', '99999999']) {
			expect(parseAutosaveSeconds(bad as string)).toBe(AUTOSAVE_DEFAULT_SECONDS);
		}
	});
	it('passes valid integers through', () => {
		expect(parseAutosaveSeconds('45')).toBe(45);
		expect(parseAutosaveSeconds('1')).toBe(1);
		expect(parseAutosaveSeconds('3600')).toBe(3600);
	});
});

describe('localStoragePostEditStore', () => {
	it('round-trips a pending edit and clears it', async () => {
		const store = localStoragePostEditStore(memoryStorage());
		await store.write(edit());
		expect(await store.read('a-post')).toMatchObject({ baseRev: 3, slug: 'a-post' });
		await store.clear('a-post');
		expect(await store.read('a-post')).toBeNull();
	});

	it('treats a corrupt entry as NO buffer, never a crash', async () => {
		const storage = memoryStorage();
		storage.setItem(bufferKey('a-post'), '{not json');
		const store = localStoragePostEditStore(storage);
		expect(await store.read('a-post')).toBeNull();
		storage.setItem(bufferKey('a-post'), JSON.stringify({ nope: true }));
		expect(await store.read('a-post')).toBeNull();
	});
});

describe('createEditScheduler', () => {
	function harness(seconds = 1) {
		const store = localStoragePostEditStore(memoryStorage());
		const wrote: PendingEdit[] = [];
		let current: PendingEdit | null = edit();
		const scheduler = createEditScheduler({
			seconds,
			current: () => current,
			store: {
				read: store.read,
				clear: store.clear,
				write: async (e) => {
					wrote.push(e);
					return store.write(e);
				}
			}
		});
		return {
			scheduler,
			wrote,
			set current_(e: PendingEdit | null) {
				current = e;
			}
		};
	}

	it('writes after the idle window, and only once per burst', async () => {
		vi.useFakeTimers();
		try {
			const h = harness(2);
			h.scheduler.schedule();
			await vi.advanceTimersByTimeAsync(1999);
			expect(h.wrote).toHaveLength(0);
			await vi.advanceTimersByTimeAsync(2);
			expect(h.wrote).toHaveLength(1);
			// a SECOND schedule without an edit in between still lands exactly one write
			h.scheduler.schedule();
			await vi.advanceTimersByTimeAsync(3000);
			expect(h.wrote).toHaveLength(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('bounds staleness during CONTINUOUS editing (idle never fires, max-wait does)', async () => {
		vi.useFakeTimers();
		try {
			const h = harness(60); // 60s knob — the config default
			const t0 = Date.now();
			// type continuously: a schedule every second, for 10 minutes
			for (let s = 0; s < 600; s++) {
				h.scheduler.schedule();
				await vi.advanceTimersByTimeAsync(1000);
			}
			// max-wait fired ~every 60s from the first unsaved edit — 10 flushes
			expect(h.wrote.length).toBeGreaterThanOrEqual(9);
			expect(h.wrote.length).toBeLessThanOrEqual(11);
			expect(Date.now() - t0).toBe(600_000);
		} finally {
			vi.useRealTimers();
		}
	});

	it('flush() writes immediately on pagehide; stop() cancels without writing', async () => {
		vi.useFakeTimers();
		try {
			const h = harness(60);
			h.scheduler.schedule();
			h.scheduler.flush();
			expect(h.wrote).toHaveLength(1);
			h.scheduler.schedule();
			h.scheduler.stop();
			await vi.advanceTimersByTimeAsync(600_000);
			expect(h.wrote).toHaveLength(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('a null current() (clean editor) never writes', async () => {
		vi.useFakeTimers();
		try {
			const h = harness(1);
			h.current_ = null;
			h.scheduler.schedule();
			await vi.advanceTimersByTimeAsync(5000);
			expect(h.wrote).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('sameDraft', () => {
	it('ignores tag ORDER, nothing else', () => {
		expect(sameDraft(draft({ tags: ['a', 'b'] }), draft({ tags: ['b', 'a'] }))).toBe(true);
		expect(sameDraft(draft(), draft({ content: 'changed' }))).toBe(false);
	});
});
