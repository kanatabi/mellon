// The diff page MOUNTS + reads its pending side from the browser store —
// the layer the node tests can't reach (localStorage, tabs, toggles, the
// gap bands). The fixture: a 10-line body with a MIDDLE edit + a trailing
// token — the exact shape that hid changes in the full-document table.
import { render, fireEvent } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fixture from './diff-page-fixture.svelte';
import { bufferKey } from '#lib/pending-edit.ts';

const HEAD = {
	slug: 'a-post',
	title: 'A post',
	subtitle: '',
	preview: '',
	date: '2026-11-21',
	tags: [],
	content: 'l0\nl1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9',
	thumbnail: null,
	status: 'draft',
	readTime: 1,
	rev: 3,
	createdAt: '2026-11-20T10:00:00Z',
	publishedAt: null,
	updatedAt: '2026-11-20T10:00:00Z'
};

const PENDING = {
	slug: 'a-post',
	baseRev: 3,
	at: Date.parse('2026-11-21T12:00:00Z'),
	draft: {
		...HEAD,
		title: 'A renamed post',
		content: 'l0\nl1\nl2\nl3\nEDITED\nl5\nl6\nl7\nl8\nl9\n\nasdkjasdkj'
	}
};

beforeEach(() => localStorage.clear());

describe('the diff page — empty state', () => {
	it('mounts and reports nothing pending when no buffer exists', async () => {
		const { getByText } = render(Fixture);
		await vi.waitFor(() => expect(getByText('nothing pending — the editor is clean')).toBeTruthy());
	});
});

describe('the diff page — metadata tab (the vault table view)', () => {
	it('renders every rail field with a status chip — the body NEVER appears', async () => {
		localStorage.setItem(bufferKey('a-post'), JSON.stringify(PENDING));
		const { getByRole, getByText } = render(Fixture);
		await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
		await fireEvent.click(getByRole('tab', { name: 'Metadata' }));
		await vi.waitFor(() => expect(getByText('A renamed post')).toBeTruthy());
		// the counts line: title changed, the other five same
		expect(getByText('1 changed · 5 unchanged')).toBeTruthy();
		// no body row — the markdown tab owns it
		expect(() => getByText(/^body$/)).toThrow();
		// Hide unchanged (the vault's toggle-button pattern) filters to changed
		await fireEvent.click(getByRole('button', { name: 'Hide unchanged' }));
		expect(getByRole('button', { name: 'Show unchanged' })).toBeTruthy();
		expect(() => getByText('subtitle')).toThrow(); // an unchanged field, filtered out
		expect(getByText('title')).toBeTruthy(); // the changed field stays
	});
});

describe('the diff page — markdown tab (whole file ⇄ changed regions)', () => {
	it('the CHANGED-ONLY view is the default first paint; the menu reveals the full file', async () => {
		localStorage.setItem(bufferKey('a-post'), JSON.stringify(PENDING));
		const { getByRole, getByText, getAllByText, getAllByRole } = render(Fixture);
		await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
		// THE DEFAULT (the owner call): the compact regions view, NO clicks —
		// the split regions' headers = the two cells (the phone's single
		// header rides the stack)
		await vi.waitFor(() => expect(getByText(/1 unchanged line/)).toBeTruthy());
		// the split regions = the SAME anatomy as the full view: the two
		// cells over their panes at EVERY width (the phone's single-header
		// stand-in is dead)
		expect(getAllByText('saved (head) · rev 3', { selector: 'h2' })).toHaveLength(1); // the left cell
		expect(getAllByText('pending', { selector: 'h2' })).toHaveLength(1); // the right cell
		expect(getAllByText(/forked from rev 3/)).toHaveLength(1); // the right cell's note
		// the regions' signs: the split cells carry them per side
		expect(getAllByText('−')).toHaveLength(1);
		expect(getAllByText('+')).toHaveLength(3);
		// the collapse round-trip (ONE chevron — the left cell's)
		await fireEvent.click(getByRole('button', { name: 'Collapse diff' }));
		expect(() => getByText(/1 unchanged line/)).toThrow();
		await fireEvent.click(getByRole('button', { name: 'Expand diff' }));
		await vi.waitFor(() => expect(getByText(/1 unchanged line/)).toBeTruthy());

		// THE MENU: three checkable items — 'Changed only' checked BY DEFAULT
		await fireEvent.click(getByRole('button', { name: 'Diff preferences' }));
		const items = getAllByRole('menuitemcheckbox');
		expect(items).toHaveLength(3);
		expect(items[0].textContent).toContain('Changed only');
		expect(items[0].getAttribute('aria-checked')).toBe('true');
		// the uncheck reveals the FULL file (the split, the memory writes)
		await fireEvent.click(items[0]);
		expect(localStorage.getItem('mellon.diff-changed-only')).toBe('false');
		await vi.waitFor(() => expect(getAllByText('l0').length).toBeGreaterThanOrEqual(2));
		expect(getAllByText('saved (head) · rev 3', { selector: 'h2' })).toHaveLength(1); // the full view's cell
		expect(getAllByText('pending', { selector: 'h2' })).toHaveLength(1); // the right cell — the phone's header is the full view's ONE table
		// the full view's collapse round-trip
		await fireEvent.click(getByRole('button', { name: 'Collapse diff' }));
		expect(() => getByText('l0')).toThrow();
		await fireEvent.click(getByRole('button', { name: 'Expand diff' }));
		await vi.waitFor(() => expect(getAllByText('l0').length).toBeGreaterThanOrEqual(2));
		// the trailing token is a real, visible add — never an invisible strip
		expect(getByText('asdkjasdkj')).toBeTruthy();
		expect(getByText('EDITED')).toBeTruthy();
	});

	describe('the inline view (the unified)', () => {
		it('flattens to the two number bars: one − line, the + lines, the same lines both-numbered', async () => {
			localStorage.setItem(bufferKey('a-post'), JSON.stringify(PENDING));
			localStorage.setItem('mellon.diff-view', 'inline');
			const { getByRole, getByText, getAllByText } = render(Fixture);
			await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
			// the memory rode in — no tap needed (the segmented control is
			// GONE; the preferences menu owns the mode now)
			expect(getAllByText('−')).toHaveLength(1);
			expect(getAllByText('+')).toHaveLength(3);
			// the remembered choice: the toggle wrote the memory
			expect(localStorage.getItem('mellon.diff-view')).toBe('inline');
			// the header = the ONE DiffFileHeader (the split's cells are gone)
			expect(getAllByText('pending', { selector: 'h2' })).toHaveLength(1);
			// the collapse = the header's chevron, the same round-trip
			await fireEvent.click(getByRole('button', { name: 'Collapse diff' }));
			expect(() => getByText('asdkjasdkj')).toThrow();
			expect(getByRole('button', { name: 'Expand diff' })).toBeTruthy();
			await fireEvent.click(getByRole('button', { name: 'Expand diff' }));
			await vi.waitFor(() => expect(getByText('asdkjasdkj')).toBeTruthy());
		});

		it('the Changed-only regions flatten too: one header, the gap bands survive', async () => {
			localStorage.setItem(bufferKey('a-post'), JSON.stringify(PENDING));
			localStorage.setItem('mellon.diff-view', 'inline');
			const { getByRole, getByText, getAllByText } = render(Fixture);
			await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
			// the changed-only default = ON — the regions are the first paint
			await vi.waitFor(() => expect(getByText(/1 unchanged line/)).toBeTruthy());
			// ONE header over the flattened regions — the two cells are gone
			// even on the desktop (one body, one header)
			expect(getAllByText('pending', { selector: 'h2' })).toHaveLength(1);
			expect(() => getByText('saved (head) · rev 3', { selector: 'h2' })).toThrow();
			// the region's lines = the SAME two-bar anatomy (the flattening
			// rode the regions' rows)
			expect(getAllByText('−')).toHaveLength(1);
			expect(getAllByText('+')).toHaveLength(3);
			expect(getByText('EDITED')).toBeTruthy();
			// the gap band survives the flattening (the view-agnostic band)
			expect(getByText(/1 unchanged line/)).toBeTruthy();
			// the collapse = the single header's chevron
			await fireEvent.click(getByRole('button', { name: 'Collapse diff' }));
			expect(() => getByText('EDITED')).toThrow();
			expect(() => getByText(/1 unchanged line/)).toThrow(); // the bands hide too
		});

		it('the preferences menu: the checkable items swap the body and write the memory', async () => {
			localStorage.setItem(bufferKey('a-post'), JSON.stringify(PENDING));
			const { getByRole, getAllByRole, getAllByText } = render(Fixture);
			await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
			// the split is the desktop default; the menu's checks agree
			await fireEvent.click(getByRole('button', { name: 'Diff preferences' }));
			const items = getAllByRole('menuitemcheckbox');
			expect(items).toHaveLength(3);
			expect(items[0].textContent).toContain('Changed only');
			expect(items[1].textContent).toContain('Split view');
			expect(items[2].textContent).toContain('Inline view');
			// pick inline: the body swaps (the changed-only default stays on —
			// the regions flatten), the memory writes
			await fireEvent.click(items[2]);
			expect(localStorage.getItem('mellon.diff-view')).toBe('inline');
			await vi.waitFor(() => expect(getAllByText('−')).toHaveLength(1));
		});
	});
});
