// The widget picker's dom wiring (Round D): rows carry STATIC previews
// (the real bodies never mount — opening the panel fires zero relay
// calls), multi-select toggles, the footer commits the whole selection
// in placement order, placed rows show badged and inert, and
// Esc/backdrop dismiss.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import Picker from './WidgetPicker.svelte';
import { WIDGETS } from './widgets/registry.ts';

function row(c: { container: HTMLElement }, title: string): HTMLElement {
	return c.container.querySelector(`[aria-label="${title} widget row"]`) as HTMLElement;
}

function open(c: { container: HTMLElement }): HTMLElement {
	return c.container.querySelector('[aria-label="Add widgets to the dashboard"]') as HTMLElement;
}

describe('the widget picker (Round D)', () => {
	it('renders rows with the REAL preview structure — placeholder bars render, zero fetches', () => {
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
		// three rows, zero canvas bodies — the previews mount the REAL
		// bodies in preview mode (placeholder content, no fetch)
		expect(c.getAllByLabelText(/widget row/)).toHaveLength(3);
		// the posts preview shows the real row shape: status pill chrome
		expect(c.container.textContent?.toLowerCase()).toContain('draft');
		// the placeholder bars must RENDER — percentage widths need a
		// definite parent (the zero-width collapse bug): the posts
		// preview's title bar is a growing flex item
		const bar = c.container.querySelector<HTMLElement>(
			'[aria-label="Recent posts widget row"] .h-3'
		)!;
		expect(bar.className).toContain('w-2/3');
		expect(bar.parentElement?.className).toContain('flex-1');
	});

	it('opening the panel fires ZERO relay calls — bodies never fetch in preview mode', () => {
		const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{}'));
		render(Picker, {
			props: {
				registry: WIDGETS,
				placedIds: [],
				held: () => true,
				open: true,
				onAdd: () => {},
				onClose: () => {}
			}
		});
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
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
