// The dashboard canvas's dom wiring (the C round — the coordinate
// model): entries place ABSOLUTELY (percent columns, px rows), resize
// drags render the blue PLACEHOLDER (provisional, layout holds) and
// apply once on release, keyboard Alt+arrows nudge through the real
// engine. happy-dom realities pinned below (dispatch targets, modifier
// getters, zero rects → the float clamps to 1px but targets don't).
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { columnLeftStyle, columnWidthStyle } from './layout.ts';
import Fixture from './grid-fixture.svelte';

// The unit-mix regression needs REAL pixel geometry (the zero-rect
// happy-dom default can't tell pixels from grid units) — the canvas and
// card get honest rects for the whole file.
const origRect = HTMLElement.prototype.getBoundingClientRect;
beforeAll(() => {
	HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
		if (this.hasAttribute('data-dashboard-grid')) {
			return { left: 0, top: 0, right: 2400, bottom: 2000, width: 2400, height: 2000 } as DOMRect;
		}
		if (this.hasAttribute('data-widget-card')) {
			return { left: 100, top: 100, right: 400, bottom: 300, width: 300, height: 200 } as DOMRect;
		}
		return origRect.call(this);
	};
});
afterAll(() => {
	HTMLElement.prototype.getBoundingClientRect = origRect;
});

function corner(c: { container: HTMLElement }): HTMLElement {
	const card = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
	return card.querySelector('[aria-label^="Resize Widget A — drag"]') as HTMLElement;
}

function captures(c: { getByTestId(id: string): HTMLElement }): HTMLElement {
	return c.getByTestId('captures') as HTMLElement;
}

describe('the dashboard canvas wiring (the coordinate model)', () => {
	it('places entries absolutely — gutter columns, px rows', () => {
		const c = render(Fixture);
		const a = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		expect(a.style.left).toBe(columnLeftStyle(0));
		expect(a.style.width).toBe(columnWidthStyle(12)); // half the canvas, one gap narrow
		const b = c.container.querySelector<HTMLElement>('[data-widget-id="w-b"]')!;
		expect(b.style.left).toBe(columnLeftStyle(12));
		expect(b.style.top).toBe('0px');
	});

	it('resize: the placeholder appears mid-drag, the layout holds, apply lands on release', async () => {
		const c = render(Fixture);
		const g = corner(c);
		fireEvent.pointerDown(g, { clientX: 0, clientY: 0, pointerId: 1 });
		// a WILD drag: the target clamps to the canvas's own ceiling
		fireEvent.pointerMove(g, { clientX: 10000, clientY: 10000, pointerId: 1 });
		await tick();
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeTruthy();
		expect(captures(c).dataset.applied).toBe('null'); // holds still
		const card = c.container.querySelector<HTMLElement>('[data-widget-card]')!;
		expect(card.style.width).not.toBe(''); // the float
		fireEvent.pointerUp(g);
		await tick();
		const applied = JSON.parse(captures(c).dataset.applied!);
		expect(applied).toEqual({ id: 'w-a', w: 24, h: 16 }); // GRID_COLS × MAX_ROW_SPAN
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeNull();
	});

	it('the right edge locks to width, the bottom edge to height', async () => {
		const c = render(Fixture);
		const w = c.container.querySelector<HTMLElement>(
			'[data-widget-id="w-a"] [aria-label="Resize Widget A width — drag, or Shift+Alt+arrows"]'
		)!;
		fireEvent.pointerDown(w, { clientX: 0, clientY: 0, pointerId: 1 });
		fireEvent.pointerMove(w, { clientX: 60, clientY: 90, pointerId: 1 });
		await tick();
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeTruthy();
		fireEvent.pointerUp(w);
		await tick();
		const applied = JSON.parse(captures(c).dataset.applied!);
		expect(applied.w).toBe(14); // 12 + 2 columns (60px ≈ 2 pitches)
		expect(applied.h).toBe(6); // locked — the dy never counted
	});

	it('the float starts at the card’s PIXEL size — never the minimum (the unit-mix regression)', async () => {
		const c = render(Fixture);
		const g = corner(c);
		// grab at the card's corner, move 10px: the float is pxW + 10px
		fireEvent.pointerDown(g, { clientX: 300, clientY: 200, pointerId: 1 });
		fireEvent.pointerMove(g, { clientX: 310, clientY: 200, pointerId: 1 });
		await tick();
		const card = c.container.querySelector<HTMLElement>('[data-widget-card]')!;
		// pxW = 300 → 310px. The unit-mix bug produced max(minW ≈ 37px, 12 + 10)
		// — the minimum size the owner saw the moment they grabbed the grip
		expect(card.style.width).toBe('310px');
		// the bottom edge locks width at the pixel start size exactly
		const s = c.container.querySelector<HTMLElement>(
			'[data-widget-id="w-a"] [aria-label="Resize Widget A height — drag, or Shift+Alt+arrows"]'
		)!;
		fireEvent.pointerDown(s, { clientX: 300, clientY: 300, pointerId: 1 });
		fireEvent.pointerMove(s, { clientX: 310, clientY: 360, pointerId: 1 });
		await tick();
		expect(card.style.width).toBe('300px'); // locked at pxW
		fireEvent.pointerUp(s);
		await tick();
	});

	it('keyboard: Shift+Alt+arrows apply immediately, Alt+arrows nudge through the engine', async () => {
		const c = render(Fixture);
		const article = c.container.querySelector<HTMLElement>('[data-widget-card]')!;
		const resizeEv = new Event('keydown', { bubbles: true });
		Object.defineProperty(resizeEv, 'key', { get: () => 'ArrowRight' });
		Object.defineProperty(resizeEv, 'shiftKey', { get: () => true });
		Object.defineProperty(resizeEv, 'altKey', { get: () => true });
		article.dispatchEvent(resizeEv);
		await tick();
		expect(JSON.parse(captures(c).dataset.applied!)).toEqual({
			id: 'w-a',
			w: 13, // 12 + 1, applied immediately (no release gesture)
			h: 6
		});
		const moveEv = new Event('keydown', { bubbles: true });
		Object.defineProperty(moveEv, 'key', { get: () => 'ArrowRight' });
		Object.defineProperty(moveEv, 'altKey', { get: () => true });
		article.dispatchEvent(moveEv);
		await tick();
		expect(JSON.parse(captures(c).dataset.nudged!)).toEqual({ id: 'w-a', dx: 1, dy: 0 });
		// the nudge went through the REAL engine: a moved, b yielded below
		const a = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		expect(a.style.left).not.toBe(columnLeftStyle(0));
	});

	it('free drag: the header is the handle — threshold, shadow layout, landing on release', async () => {
		const c = render(Fixture);
		const handle = c.container.querySelector<HTMLElement>(
			'[data-widget-id="w-a"] [data-drag-handle]'
		)!;
		// arm, then cross the 4px threshold
		fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
		fireEvent.pointerMove(handle, { clientX: 2, clientY: 2, pointerId: 1 });
		await tick();
		expect(captures(c).dataset.dropped).toBe('null'); // still arming
		fireEvent.pointerMove(handle, { clientX: 60, clientY: 10, pointerId: 1 });
		await tick();
		// dragging: the blue placeholder marks the target cell; the
		// dragged wrapper follows the pointer in px
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeTruthy();
		const a = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		expect(a.style.left.endsWith('px')).toBe(true); // pointer-follow, not %
		// release: lands through the engine, persists once, placeholder gone
		fireEvent.pointerUp(handle);
		await tick();
		const dropped = JSON.parse(captures(c).dataset.dropped!);
		expect(dropped.id).toBe('w-a');
		expect(Number.isFinite(dropped.x)).toBe(true);
		expect(Number.isFinite(dropped.y)).toBe(true);
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeNull();
	});

	it('a click on the header (no threshold) never moves anything', async () => {
		const c = render(Fixture);
		const handle = c.container.querySelector<HTMLElement>(
			'[data-widget-id="w-a"] [data-drag-handle]'
		)!;
		fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
		fireEvent.pointerUp(handle);
		await tick();
		expect(captures(c).dataset.dropped).toBe('null');
		expect(captures(c).dataset.cancelled).toBe('false');
	});

	it('Escape mid-drag cancels — nothing lands', async () => {
		const c = render(Fixture);
		const handle = c.container.querySelector<HTMLElement>(
			'[data-widget-id="w-a"] [data-drag-handle]'
		)!;
		const article = c.container.querySelector<HTMLElement>('[data-widget-card]')!;
		fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
		fireEvent.pointerMove(handle, { clientX: 60, clientY: 10, pointerId: 1 });
		await tick();
		article.dispatchEvent(
			Object.assign(new Event('keydown', { bubbles: true }), { key: 'Escape' })
		);
		await tick();
		expect(captures(c).dataset.cancelled).toBe('true');
		expect(captures(c).dataset.dropped).toBe('null');
		expect(c.container.querySelector('[data-resize-placeholder]')).toBeNull();
	});

	it('delete: the trash button removes the card from the canvas', async () => {
		const c = render(Fixture);
		const before = c.container.querySelectorAll('[data-widget-card]').length;
		const trash = c.container.querySelector<HTMLElement>(
			'[data-widget-id="w-a"] [aria-label="Delete Widget A from the dashboard"]'
		)!;
		trash.click();
		await tick();
		expect(c.container.querySelectorAll('[data-widget-card]').length).toBe(before - 1);
		expect(c.container.querySelector('[data-widget-id="w-a"]')).toBeNull();
		expect(captures(c).dataset.deleted).toBe('w-a');
	});
});
