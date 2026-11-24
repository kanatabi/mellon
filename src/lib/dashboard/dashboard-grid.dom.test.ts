// The dashboard grid's dom wiring (Round B3): resize drags render the
// blue PLACEHOLDER (provisional span, layout holds still) and apply +
// persist once on release; reorder drags render the GHOST at the
// landing slot (the sidebar machine); FLIP animates every layout
// change. happy-dom realities pinned below (dispatch targets, modifier
// getters, non-rendered grid → the geometry fallback path).
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './grid-fixture.svelte';

/** the corner grip of a card (its aria-label distinguishes it from the
 *  edge zones). */
function corner(c: { container: HTMLElement }): HTMLElement {
	const card = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
	return card.querySelector('[aria-label^="Resize Widget A — drag"]') as HTMLElement;
}

function edge(c: { container: HTMLElement }, label: string): HTMLElement {
	const card = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
	return card.querySelector(`[aria-label="${label}"]`) as HTMLElement;
}

function captures(c: { getByTestId(id: string): HTMLElement }): HTMLElement {
	return c.getByTestId('captures') as HTMLElement;
}

describe('the dashboard grid wiring (Round B3)', () => {
	it('renders one entry per layout card, both present', () => {
		const c = render(Fixture);
		expect(c.getAllByLabelText(/widget — Alt\+arrows/)).toHaveLength(2);
	});

	it('resize: the placeholder appears mid-drag, the layout holds, apply lands on release', async () => {
		const c = render(Fixture);
		const g = corner(c);
		fireEvent.pointerDown(g, { clientX: 0, clientY: 0, pointerId: 1 });
		// a WILD drag: the preview must clamp to the grid's own bounds —
		// release keeps exactly what was previewed (the snap-back bug)
		fireEvent.pointerMove(g, { clientX: 10000, clientY: 10000, pointerId: 1 });
		await tick();
		// the blue container is rendered from the provisional span…
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeTruthy();
		// …and NO apply has landed yet (the layout holds still)
		expect(captures(c).dataset.applied).toBe('null');
		// the card FLOATS: inline pixel size on the article
		const card = c.container.querySelector<HTMLElement>('[data-widget-card]')!;
		expect(card.style.width).not.toBe('');
		fireEvent.pointerUp(g);
		await tick();
		// release: applied + persisted through onSpanApply, placeholder
		// gone — and the value is the GRID MAXIMUM, never a lie
		const applied = JSON.parse(captures(c).dataset.applied!);
		expect(applied.id).toBe('w-a');
		expect(applied.colSpan).toBe(12); // GRID_COLS — the true ceiling
		expect(applied.rowSpan).toBe(8); // MAX_ROW_SPAN — the true ceiling
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeNull();
	});

	it('the right edge locks to width, the bottom edge to height', async () => {
		const c = render(Fixture);
		const w = edge(c, 'Resize Widget A width — drag, or Shift+Alt+arrows');
		fireEvent.pointerDown(w, { clientX: 0, clientY: 0, pointerId: 1 });
		fireEvent.pointerMove(w, { clientX: 60, clientY: 90, pointerId: 1 });
		await tick();
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeTruthy();
		fireEvent.pointerUp(w);
		await tick();
		const applied = JSON.parse(captures(c).dataset.applied!);
		expect(applied.colSpan).toBe(12);
		expect(applied.rowSpan).toBe(6); // locked — the dy never counted
	});

	it('a grip gesture never enters the reorder machine (the gesture split)', async () => {
		const c = render(Fixture);
		const g = corner(c);
		// even if the browser starts a native drag from the grip, the trap
		// kills it before the grid's reorder handler sees it
		const ev = new Event('dragstart', { bubbles: true, cancelable: true });
		g.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		expect(captures(c).dataset.placed).toBe('null'); // no reorder landed
	});

	it('keyboard parity: Shift+Alt+arrows apply immediately, Alt+arrows move', async () => {
		const c = render(Fixture);
		// the keydown handler lives on the ARTICLE — dispatching on the
		// wrapper can never reach it (events propagate up, never down)
		const article = c.container.querySelector<HTMLElement>('[data-widget-card]')!;
		// happy-dom's KeyboardEvent init drops the modifier getters — a
		// plain Event with defined getters dispatches reliably
		const resizeEv = new Event('keydown', { bubbles: true });
		Object.defineProperty(resizeEv, 'key', { get: () => 'ArrowRight' });
		Object.defineProperty(resizeEv, 'shiftKey', { get: () => true });
		Object.defineProperty(resizeEv, 'altKey', { get: () => true });
		article.dispatchEvent(resizeEv);
		await tick();
		expect(JSON.parse(captures(c).dataset.applied!)).toEqual({
			id: 'w-a',
			colSpan: 7,
			rowSpan: 6
		}); // 6 + 1, applied immediately (keyboard has no release gesture)
		const moveEv = new Event('keydown', { bubbles: true });
		Object.defineProperty(moveEv, 'key', { get: () => 'ArrowDown' });
		Object.defineProperty(moveEv, 'altKey', { get: () => true });
		article.dispatchEvent(moveEv);
		await tick();
		expect(JSON.parse(captures(c).dataset.moved!)).toEqual({ id: 'w-a', dir: 1 });
	});

	it('reorder: the ghost opens the landing slot, the source stays mounted', async () => {
		const c = render(Fixture);
		const a = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		const b = c.container.querySelector<HTMLElement>('[data-widget-id="w-b"]')!;
		a.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
		await tick();
		// the lift: the source hides IN PLACE but stays CONNECTED — a
		// detached source never receives dragend (the vanishing-panel bug)
		expect(a.isConnected).toBe(true);
		expect(a.classList.contains('hidden')).toBe(true);
		// happy-dom drops clientY from DragEvent init (same class as the
		// KeyboardEvent modifiers) — define it on the instance
		const over = new DragEvent('dragover', { bubbles: true });
		Object.defineProperty(over, 'clientY', { get: () => -1 }); // before
		b.dispatchEvent(over);
		await tick();
		// the ghost opens the landing slot before the drop
		expect(c.container.querySelector('[data-ghost]')).toBeTruthy();
		b.dispatchEvent(new DragEvent('drop', { bubbles: true }));
		await tick();
		const placed = JSON.parse(captures(c).dataset.placed!);
		expect(placed.dragId).toBe('w-a');
		expect(placed.beforeId).toBe('w-b');
		// the ghost is gone once the real card lands
		expect(c.container.querySelector('[data-ghost]')).toBeNull();
	});

	it('a drag that starts and ends without a landing never sticks (the vanishing-panel regression)', async () => {
		const c = render(Fixture);
		const a = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		a.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
		await tick();
		expect(a.classList.contains('hidden')).toBe(true); // hidden mid-drag
		// the dragend reaches the document capture net even though the
		// event does not bubble
		a.dispatchEvent(new DragEvent('dragend'));
		await tick();
		expect(a.classList.contains('hidden')).toBe(false); // restored
		expect(c.container.querySelector('[data-ghost]')).toBeNull();
		expect(JSON.parse(captures(c).dataset.placed!)).toBeNull(); // no landing
	});

	it('hidden reflow: the un-pinned card leaves the grid', async () => {
		const c = render(Fixture);
		const before = c.container.querySelectorAll('[data-widget-card]').length;
		const eye = c.container.querySelector<HTMLElement>(
			'[data-widget-id="w-a"] [aria-label="Unpin Widget A"]'
		)!;
		eye.click();
		await tick();
		const after = c.container.querySelectorAll('[data-widget-card]').length;
		expect(after).toBe(before - 1);
		expect(captures(c).dataset.toggled).toBe('w-a');
	});
});
