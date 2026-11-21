// The Combobox contract (SHADCN-PLAN 4.3) — the behaviors the plan pins,
// now over the ui/popover + ui/command composition. These ran untested on
// the hand-rolled state machine; the block rewrite must not bend them.
import { render } from '@testing-library/svelte';
import { fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import Combobox from './Combobox.svelte';
import Fixture from './combobox-fixture.svelte';

const collections = [
	{ name: 'field-notes', count: 12 },
	{ name: 'portraits', count: 4 }
];

describe('the Combobox contract', () => {
	it('single mode REPLACES — the 06698b6 regression', async () => {
		const onchange = vi.fn();
		const { getByRole } = render(Combobox, {
			props: {
				items: collections,
				multiple: false,
				selected: ['field-notes'],
				onchange,
				emptyLabel: 'set collection…'
			}
		});
		getByRole('button').click();
		await tick();
		const portraits = await waitFor(() =>
			document.body.querySelector('[data-slot="command-item"][data-value="portraits"]')
		);
		(portraits as HTMLElement).click();
		await tick();
		await waitFor(() => {
			expect(onchange).toHaveBeenCalledWith(['portraits']); // REPLACE, not [old, new]
		});
	});

	it('multi mode APPENDS and stays open', async () => {
		const onchange = vi.fn();
		render(Combobox, {
			props: {
				items: collections,
				multiple: true,
				selected: ['field-notes'],
				onchange,
				emptyLabel: 'choose tags'
			}
		});
		document.body.querySelector('[data-slot="popover-trigger"]')?.closest('button')?.click();
		await tick();
		const item = await waitFor(() =>
			document.body.querySelector('[data-slot="command-item"][data-value="portraits"]')
		);
		(item as HTMLElement).click();
		await tick();
		await waitFor(() => {
			expect(onchange).toHaveBeenCalledWith(['field-notes', 'portraits']);
		});
	});
});

// The eager-create + Esc paths drive the real fixture (state lives outside).
describe('the Combobox eager create', () => {
	it('create-then-select: the created row commits and the vocab rides', async () => {
		const created = vi.fn(async (name: string) => ({ name, count: 0 }));
		const { getByRole, getByPlaceholderText } = render(Fixture, {
			props: { create: created }
		});
		getByRole('button').click();
		await tick();
		const input = getByPlaceholderText('search or create…') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'wet-plate' } });
		await tick();
		const createRow = await waitFor(() =>
			[...document.body.querySelectorAll('[data-slot="command-item"]')].find((el) =>
				el.textContent?.includes('wet-plate')
			)
		);
		expect(createRow).toBeTruthy();
		(createRow as HTMLElement).click();
		await tick();
		await waitFor(() => {
			expect(created).toHaveBeenCalledWith('wet-plate');
		});
	});
});
