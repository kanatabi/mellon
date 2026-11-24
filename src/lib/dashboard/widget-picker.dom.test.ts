// The widget picker's dom wiring (Round D): rows carry STATIC previews
// (the real bodies never mount — opening the panel fires zero relay
// calls), multi-select toggles, the footer commits the whole selection
// in placement order, placed rows show badged and inert, and
// Esc/backdrop dismiss.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import Picker from './WidgetPicker.svelte';
import { WIDGETS } from './widgets/registry.ts';

function row(c: { container: HTMLElement }, title: string): HTMLElement {
	return c.container.querySelector(`[aria-label="${title} widget row"]`) as HTMLElement;
}

function open(c: { container: HTMLElement }): HTMLElement {
	return c.container.querySelector('[aria-label="Add widgets to the dashboard"]') as HTMLElement;
}

describe('the widget picker (Round D)', () => {
	it('renders rows for the available widgets with STATIC previews — no mounted bodies', () => {
		const c = render(Picker, {
			props: {
				registry: WIDGETS,
				placedIds: [],
				held: () => true,
				open: true,
				onAdd: () => {},
				onClose: () => {}
			}
		});
		expect(open(c)).toBeTruthy();
		// three rows, zero widget bodies — the preview is icon + skeleton bars
		expect(c.getAllByLabelText(/widget row/)).toHaveLength(3);
		expect(c.container.querySelector('[data-widget-card]')).toBeNull();
	});

	it('multi-select: toggling two rows then Add commits BOTH ids in order', async () => {
		let added: string[] = [];
		const c = render(Picker, {
			props: {
				registry: WIDGETS,
				placedIds: [],
				held: () => true,
				open: true,
				onAdd: (ids) => (added = ids),
				onClose: () => {}
			}
		});
		fireEvent.click(row(c, 'Recent posts'));
		fireEvent.click(row(c, 'Newest tags'));
		await tick();
		fireEvent.click(c.container.querySelector<HTMLElement>('footer button')!);
		await tick();
		expect(added).toEqual(['recent-posts', 'recent-tags']); // selection order
	});

	it('placed widgets show badged and inert — the picker never re-deletes', async () => {
		const c = render(Picker, {
			props: {
				registry: WIDGETS,
				placedIds: ['recent-posts'],
				held: () => true,
				open: true,
				onAdd: () => {},
				onClose: () => {}
			}
		});
		const placedRow = row(c, 'Recent posts') as HTMLButtonElement;
		expect(placedRow.disabled).toBe(true);
		expect(c.container.textContent).toContain('on the dashboard');
	});

	it('scope-less rows never render — held() is the mount gate, mirrored here', () => {
		const c = render(Picker, {
			props: {
				registry: WIDGETS,
				placedIds: [],
				held: (scope?: string) => scope !== 'content:manage', // holds nothing here
				open: true,
				onAdd: () => {},
				onClose: () => {}
			}
		});
		expect(c.container.textContent).toContain('no widget access yet');
	});

	it('Escape closes; the backdrop click closes', async () => {
		let closed = false;
		render(Picker, {
			props: {
				registry: WIDGETS,
				placedIds: [],
				held: () => true,
				open: true,
				onAdd: () => {},
				onClose: () => (closed = true)
			}
		});
		await tick();
		fireEvent.keyDown(window, { key: 'Escape' });
		await tick();
		expect(closed).toBe(true);
	});
});
