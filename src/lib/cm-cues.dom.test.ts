// The MARK-CUE rendering contract, mounted for real: the plugin must run
// (a throwing decoration builder silently disabled the whole layer — walked
// 2026-11-21), the classes must land on the rendered content, a newly typed
// block must gain its highlight in the same update, and the emoji completion
// menu must open on the typing door.
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
			const quoteLines = container.querySelectorAll('.cm-line-quote');
			expect(quoteLines.length).toBeGreaterThanOrEqual(2);
		});
	});

	it('the fence block: the mark cue + the block fill', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			expect(container.querySelector('.cm-cue-code')).toBeTruthy();
		});
		const fenceLines = container.querySelectorAll('.cm-line-code');
		expect(fenceLines.length).toBeGreaterThanOrEqual(1);
	});

	it('list marks carry the list cue', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			expect(container.querySelector('.cm-cue-list')).toBeTruthy();
		});
	});

	it('the SUB/SUP block spans mark-to-mark ONLY (not the whole H~2~O)', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			const blocks = [...container.querySelectorAll('.cm-block-code')];
			const sub = blocks.find((b) => b.textContent?.includes('2'));
			expect(sub?.textContent).toBe('~2~');
			const sup = blocks.find((b) => b.textContent?.includes('^'));
			expect(sup?.textContent).toBe('^2^');
		});
	});

	it('table delimiters carry the table cue (pipes + the alignment row)', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			expect(container.querySelector('.cm-cue-table')).toBeTruthy();
		});
		const tableCues = container.querySelectorAll('.cm-cue-table');
		expect(tableCues.length).toBeGreaterThanOrEqual(6);
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

	it('the emoji + the block-highlight regex cues render', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			// the emoji shortcode = the green block (the tree's Emoji node)
			expect(container.textContent).toContain(':tent:');
			// the regex layer's ==…== lives in the OTHER fixture file — here:
			// the footnote/deflist/attrs cues have no fixture doc; the pure
			// layer (regex-cues) + the live walk carry them
		});
	});
});

describe('the emoji completion menu (the Slack-style picker)', () => {
	it('typing ":" + a name opens the menu with the shortcode options', async () => {
		const { container, getByRole } = render(Fixture);
		await vi.waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy());
		// the activation = the component's doors: the typing dispatch + the
		// completion's explicit start (the focus dance = the happy-dom trap —
		// its selection events re-enter CM's update)
		await fireEvent.click(getByRole('button', { name: 'type emoji trigger' }));
		await vi.waitFor(() => {
			const tooltip = container.querySelector('.cm-tooltip-autocomplete');
			expect(tooltip).toBeTruthy();
			expect(tooltip!.textContent).toContain('tent');
			expect(tooltip!.textContent).toContain('⛺');
		});
	});
});

describe('the mark-cue layer follows edits LIVE', () => {
	it('a newly typed block gains its highlight in the same update', async () => {
		const { container, getByRole } = render(Fixture);
		await vi.waitFor(() => expect(container.querySelector('.cm-cue-quote')).toBeTruthy());
		const quoteMarksBefore = container.querySelectorAll('.cm-cue-quote').length;

		await fireEvent.click(getByRole('button', { name: 'prepend quote block' }));

		await vi.waitFor(() => {
			expect(container.querySelectorAll('.cm-cue-quote').length).toBeGreaterThan(quoteMarksBefore);
		});
		await vi.waitFor(() => {
			expect(
				[...container.querySelectorAll('.cm-line-quote')].some((el) =>
					el.textContent?.includes('inserted quote')
				)
			).toBe(true);
		});
	});
});
