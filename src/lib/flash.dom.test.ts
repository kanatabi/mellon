import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissFlash, flash, flashState } from './flash.svelte.ts';

// THE SNACKBAR'S MODULE: one standing notification, the auto-dismiss at
// 3s, a fresh flash replaces the standing one and restarts the timer.
describe("flash — the snackbar's module", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		dismissFlash();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('the flash lands and auto-dismisses at 3s', () => {
		flash('ok', 'metadata saved');
		expect(flashState.current?.text).toBe('metadata saved');
		vi.advanceTimersByTime(2999);
		expect(flashState.current?.text).toBe('metadata saved');
		vi.advanceTimersByTime(1);
		expect(flashState.current).toBeNull();
	});

	it('a fresh flash replaces the standing one (the timer restarts)', () => {
		flash('ok', 'first');
		vi.advanceTimersByTime(2500);
		flash('danger', 'second');
		vi.advanceTimersByTime(2999);
		expect(flashState.current?.text).toBe('second');
		vi.advanceTimersByTime(1);
		expect(flashState.current).toBeNull();
	});

	it('the danger kind rides through (the snackbar renders role="alert")', () => {
		flash('danger', 'save failed');
		expect(flashState.current?.kind).toBe('danger');
	});

	it('the explicit dismiss clears immediately', () => {
		flash('ok', 'markdown copied');
		dismissFlash();
		expect(flashState.current).toBeNull();
	});
});
