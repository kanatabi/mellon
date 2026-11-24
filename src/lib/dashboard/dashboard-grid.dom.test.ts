// The dashboard grid's dom wiring (Round B): the RESIZE grip emits span
// deltas to the grid (preview live, commit on release), drag events land
// through place(), and hidden toggles reflow (the card leaves the grid).
// Pointer capture is guarded in the component — happy-dom may not have it.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './grid-fixture.svelte';

function grip(card: HTMLElement): HTMLElement {
	return card.querySelector('[role="separator"]') as HTMLElement;
}

describe('the dashboard grid wiring (Round B)', () => {
	it('renders one entry per layout card, both present', () => {
		const { getAllByLabelText } = render(Fixture);
		expect(getAllByLabelText(/widget — Alt\+arrows/)).toHaveLength(2);
	});

	it('the resize grip: pixel deltas → span deltas, commit on release', async () => {
		const { container, getByTestId } = render(Fixture);
		const card = container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		const g = grip(card);
		fireEvent.pointerDown(g, { clientX: 0, clientY: 0, pointerId: 1 });
		// 100px right of the start: the card's happy-dom rect is zero-width,
		// so the colW math rounds to +4 columns — the WIRING is the assert
		fireEvent.pointerMove(g, { clientX: 100, clientY: 0, pointerId: 1 });
		await tick();
		const resized = JSON.parse(getByTestId('captures').dataset.resized!);
		expect(resized.id).toBe('w-a');
		expect(resized.colDelta).toBeGreaterThan(0);
		fireEvent.pointerUp(g);
		await tick();
		expect(getByTestId('captures').dataset.committed).toBe('true');
	});

	it('keyboard parity: Shift+Alt+arrows resize, Alt+arrows move', async () => {
		const { container, getByTestId } = render(Fixture);
		// the keydown handler lives on the ARTICLE — dispatching on the
		// wrapper can never reach it (events propagate up, never down)
		const article = container.querySelector<HTMLElement>('[data-widget-card]')!;
		// happy-dom's KeyboardEvent init drops the modifier getters — a
		// plain Event with defined getters dispatches through Svelte's
		// delegated keydown reliably
		const resizeEv = new Event('keydown', { bubbles: true });
		Object.defineProperty(resizeEv, 'key', { get: () => 'ArrowRight' });
		Object.defineProperty(resizeEv, 'shiftKey', { get: () => true });
		Object.defineProperty(resizeEv, 'altKey', { get: () => true });
		article.dispatchEvent(resizeEv);
		await tick();
		const resized = JSON.parse(getByTestId('captures').dataset.resized!);
		expect(resized.id).toBe('w-a');
		expect(resized.colDelta).toBe(1);
		const moveEv = new Event('keydown', { bubbles: true });
		Object.defineProperty(moveEv, 'key', { get: () => 'ArrowDown' });
		Object.defineProperty(moveEv, 'altKey', { get: () => true });
		article.dispatchEvent(moveEv);
		await tick();
		const moved = JSON.parse(getByTestId('captures').dataset.moved!);
		expect(moved).toEqual({ id: 'w-a', dir: 1 });
	});

	it('drag landing: dragstart → dragover → drop lands through place()', async () => {
		const { container, getByTestId } = render(Fixture);
		const a = container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		const b = container.querySelector<HTMLElement>('[data-widget-id="w-b"]')!;
		a.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
		b.dispatchEvent(new DragEvent('dragover', { bubbles: true }));
		b.dispatchEvent(new DragEvent('drop', { bubbles: true }));
		await tick();
		const placed = JSON.parse(getByTestId('captures').dataset.placed!);
		expect(placed.dragId).toBe('w-a');
		expect(placed.beforeId).toBe('w-b');
	});

	it('hidden reflow: the un-pinned card leaves the grid', async () => {
		const { container, getByTestId } = render(Fixture);
		const before = container.querySelectorAll('[data-widget-card]').length;
		const eye = container.querySelector<HTMLElement>(
			'[data-widget-id="w-a"] [aria-label="Unpin Widget A"]'
		)!;
		eye.click();
		await tick();
		const after = container.querySelectorAll('[data-widget-card]').length;
		expect(after).toBe(before - 1);
		expect(getByTestId('captures').dataset.toggled).toBe('w-a');
	});
});
