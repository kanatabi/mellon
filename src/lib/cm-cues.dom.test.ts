// The MARK-CUE rendering contract, mounted for real: the plugin must run
// (a throwing decoration builder silently disabled the whole layer — walked
// 2026-11-21), the classes must land on the rendered content, and a newly
// typed block must gain its highlight in the same update.
// NOTE on the viewport: happy-dom gives the editor zero height, so CM's
// viewport collapses toward the doc head — assertions on the FIRST lines
// hold; deep-in-document assertions are covered by the pure cueFor tests.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Fixture from './cm-cues-fixture.svelte';

describe('the mark-cue layer renders', () => {
	it('the heading mark wears its cue', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			expect(container.querySelector('.cm-cue-heading')).toBeTruthy();
		});
	});

	it('the quote block: marks + the block border cue on every quote line', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			expect(container.querySelector('.cm-cue-quote')).toBeTruthy();
			// BOTH quote lines carry the line-cue (the whole block is the cue)
			const quoteLines = container.querySelectorAll('.cm-line-quote');
			expect(quoteLines.length).toBeGreaterThanOrEqual(2);
		});
	});

	it('the fence block: the mark cue + the block fill', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			expect(container.querySelector('.cm-cue-code')).toBeTruthy();
		});
		// the fence sits near the doc head — inside the collapsed viewport
		const fenceLines = container.querySelectorAll('.cm-line-code');
		expect(fenceLines.length).toBeGreaterThanOrEqual(1);
	});

	it('list marks carry the list cue', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			expect(container.querySelector('.cm-cue-list')).toBeTruthy();
		});
	});

	it('the INLINE spans carry the whole-span block tint (bold/italic/strike/code/link)', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			for (const cls of [
				'cm-block-bold',
				'cm-block-italic',
				'cm-block-strike',
				'cm-block-code',
				'cm-block-link'
			]) {
				expect(container.querySelector(`.${cls}`)).toBeTruthy();
			}
		});
		// the BLOCK covers the WHOLE span: the bold's bg span contains the text
		// AND the marks (the owner ruling: the entire extent is the cue)
		const bold = container.querySelector('.cm-block-bold');
		expect(bold?.textContent).toBe('**bold text**');
	});

	it('table delimiters carry the table cue (pipes + the alignment row)', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			expect(container.querySelector('.cm-cue-table')).toBeTruthy();
		});
		// every pipe in the table (3 rows × 3 pipes + the alignment colons' row)
		const tableCues = container.querySelectorAll('.cm-cue-table');
		expect(tableCues.length).toBeGreaterThanOrEqual(6);
	});
});

describe('the mark-cue layer follows edits LIVE', () => {
	it('a newly typed block gains its highlight in the same update', async () => {
		const { container, getByRole } = render(Fixture);
		await vi.waitFor(() => expect(container.querySelector('.cm-cue-quote')).toBeTruthy());
		const quoteMarksBefore = container.querySelectorAll('.cm-cue-quote').length;

		// "type" a new quote block: the fixture prepends it through the value
		// binding — the component's real external-update path (docChanged →
		// re-parse → re-decorate, one update)
		await fireEvent.click(getByRole('button', { name: 'prepend quote block' }));

		await vi.waitFor(() => {
			expect(container.querySelectorAll('.cm-cue-quote').length).toBeGreaterThan(quoteMarksBefore);
		});
		// the NEW block's line cue is there too (the block highlight, live)
		await vi.waitFor(() => {
			expect(
				[...container.querySelectorAll('.cm-line-quote')].some((el) =>
					el.textContent?.includes('inserted quote')
				)
			).toBe(true);
		});
	});
});
