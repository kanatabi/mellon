import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissFlash, flash, flashState } from './flash.svelte.ts';

// THE SNACKBAR'S MODULE v2: one standing notification, the title +
// description shape, the lifetimes per kind (the ok/warn = 5s; the danger
// = sticky until dismissed — the owner's agreement), a fresh flash
// replaces the standing one and restarts the timer.
describe("flash — the snackbar's module", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		dismissFlash();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('the ok flash lands and auto-dismisses at 5s', () => {
		flash({ kind: 'ok', title: 'Metadata saved' });
		expect(flashState.current?.title).toBe('Metadata saved');
		vi.advanceTimersByTime(4999);
		expect(flashState.current?.title).toBe('Metadata saved');
		vi.advanceTimersByTime(1);
		expect(flashState.current).toBeNull();
	});

	it('the description rides through (the two-line card)', () => {
		flash({ kind: 'ok', title: 'Saved', description: 'rev 4' });
		expect(flashState.current?.description).toBe('rev 4');
	});

	it('a fresh flash replaces the standing one (the timer restarts)', () => {
		flash({ kind: 'ok', title: 'first' });
		vi.advanceTimersByTime(4500);
		flash({ kind: 'ok', title: 'second' });
		vi.advanceTimersByTime(4999);
		expect(flashState.current?.title).toBe('second');
		vi.advanceTimersByTime(1);
		expect(flashState.current).toBeNull();
	});

	it('the DANGER is sticky: no auto-dismiss at any horizon', () => {
		flash({ kind: 'danger', title: 'Save failed', description: 'the network died', sticky: true });
		vi.advanceTimersByTime(60_000);
		expect(flashState.current?.title).toBe('Save failed');
	});

	it('the explicit dismiss retires even the sticky', () => {
		flash({ kind: 'danger', title: 'Save failed', sticky: true });
		dismissFlash();
		expect(flashState.current).toBeNull();
	});

	it("the action rides through (the conflict's diff door)", () => {
		let ran = false;
		flash({
			kind: 'warn',
			title: 'Save conflict',
			description: 'someone saved first',
			sticky: true,
			action: { label: 'Review diff', run: () => (ran = true) }
		});
		expect(flashState.current?.action?.label).toBe('Review diff');
		flashState.current?.action?.run();
		expect(ran).toBe(true);
	});
});
