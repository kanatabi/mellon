// The dashboard grid's dom wiring (Round B/B2): the RESIZE zones emit
// ABSOLUTE span targets (preview live, commit on release), a grip
// gesture NEVER enters the reorder machine (the gesture split), drag
// events land through place(), and hidden toggles reflow. happy-dom
// realities pinned below (dispatch targets, modifier getters).
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './grid-fixture.svelte';

/** the corner grip of a card (its aria-label distinguishes it from the
 *  edge zones). */
function corner(card: HTMLElement): HTMLElement {
	return card.querySelector('[aria-label^="Resize Widget A — drag"]') as HTMLElement;
}

function captures(c: { getByTestId(id: string): HTMLElement }): HTMLElement {
	return c.getByTestId('captures') as HTMLElement;
}

describe('the dashboard grid wiring (Round B2)', () => {
	it('renders one entry per layout card, both present', () => {
		const c = render(Fixture);
		expect(c.getAllByLabelText(/widget — Alt\+arrows/)).toHaveLength(2);
	});

	it('the corner grip: absolute span targets live, commit on release', async () => {
		const c = render(Fixture);
		const card = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		const g = corner(card);
		fireEvent.pointerDown(g, { clientX: 0, clientY: 0, pointerId: 1 });
		// 100px right of the start: the card's happy-dom rect is zero-width,
		// so the pitch math rounds large — the WIRING is the assert
		fireEvent.pointerMove(g, { clientX: 100, clientY: 0, pointerId: 1 });
		await tick();
		const target = JSON.parse(captures(c).dataset.spanTarget!);
		expect(target.id).toBe('w-a');
		expect(target.colSpan).toBeGreaterThan(3); // absolute, past the start
		expect(target.rowSpan).toBe(3); // the corner also owns the row axis
		fireEvent.pointerUp(g);
		await tick();
		expect(captures(c).dataset.committed).toBe('true');
	});

	it('the right edge locks to width, the bottom edge to height', async () => {
		const c = render(Fixture);
		const card = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		const edge = (label: string) => card.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
		fireEvent.pointerDown(edge('Resize Widget A width — drag, or Shift+Alt+arrows'), {
			clientX: 0,
			clientY: 0,
			pointerId: 1
		});
		fireEvent.pointerMove(edge('Resize Widget A width — drag, or Shift+Alt+arrows'), {
			clientX: 50,
			clientY: 90,
			pointerId: 1
		});
		await tick();
		const width = JSON.parse(captures(c).dataset.spanTarget!);
		expect(width.colSpan).toBeGreaterThan(3);
		expect(width.rowSpan).toBe(3); // locked
		fireEvent.pointerUp(edge('Resize Widget A width — drag, or Shift+Alt+arrows'));
	});

	it('a grip gesture never enters the reorder machine (the gesture split)', async () => {
		const c = render(Fixture);
		const card = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		const g = corner(card);
		// even if the browser starts a native drag from the grip, the trap
		// kills it before the grid's reorder handler sees it
		const ev = new Event('dragstart', { bubbles: true, cancelable: true });
		g.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		expect(captures(c).dataset.placed).toBe('null'); // no reorder landed
	});

	it('keyboard parity: Shift+Alt+arrows resize (absolute), Alt+arrows move', async () => {
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
		const target = JSON.parse(captures(c).dataset.spanTarget!);
		expect(target).toEqual({ id: 'w-a', colSpan: 4, rowSpan: 3 }); // 3 + 1
		const moveEv = new Event('keydown', { bubbles: true });
		Object.defineProperty(moveEv, 'key', { get: () => 'ArrowDown' });
		Object.defineProperty(moveEv, 'altKey', { get: () => true });
		article.dispatchEvent(moveEv);
		await tick();
		const moved = JSON.parse(captures(c).dataset.moved!);
		expect(moved).toEqual({ id: 'w-a', dir: 1 });
	});

	it('drag landing: dragstart → dragover → drop lands through place()', async () => {
		const c = render(Fixture);
		const a = c.container.querySelector<HTMLElement>('[data-widget-id="w-a"]')!;
		const b = c.container.querySelector<HTMLElement>('[data-widget-id="w-b"]')!;
		a.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
		b.dispatchEvent(new DragEvent('dragover', { bubbles: true }));
		b.dispatchEvent(new DragEvent('drop', { bubbles: true }));
		await tick();
		const placed = JSON.parse(captures(c).dataset.placed!);
		expect(placed.dragId).toBe('w-a');
		expect(placed.beforeId).toBe('w-b');
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
