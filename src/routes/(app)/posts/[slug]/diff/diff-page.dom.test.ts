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
	it('shows the whole file by default and collapses to regions on the toggle', async () => {
		localStorage.setItem(bufferKey('a-post'), JSON.stringify(PENDING));
		const { getByRole, getByText, getAllByText, getAllByRole } = render(Fixture);
		await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
		// the head's identity = the mobile's TRACE ROW's title + the desktop
		// PANE HEADERS (the owner's indicator row: HEAD −dels over the left
		// pane, PENDING +adds over the right — one chevron, the cells sit
		// over their panes); the l0 line renders in the both modes' both sides
		expect(getAllByText('saved (head) · rev 3')).toHaveLength(2); // the trace row + the desktop header cell
		expect(getAllByText('pending', { exact: false }).length).toBeGreaterThanOrEqual(2);
		expect(getByText('forked from rev 3')).toBeTruthy(); // the right cell's note (the mobile's is the longer line)
		expect(getByText('+3')).toBeTruthy(); // the additions, on the PENDING header
		expect(getByText('−1')).toBeTruthy(); // the deletions, on the HEAD header
		expect(getAllByText('l0').length).toBeGreaterThanOrEqual(2);
		// the header's chevron collapses the desktop table, the headers
		// stay (the mobile's free-collapse, mirrored)
		await fireEvent.click(getByRole('button', { name: 'Collapse diff' }));
		expect(() => getByText('l0')).toThrow();
		expect(getByRole('button', { name: 'Expand diff' })).toBeTruthy();
		await fireEvent.click(getByRole('button', { name: 'Expand diff' }));
		await vi.waitFor(() => expect(getAllByText('l0').length).toBeGreaterThanOrEqual(2));
		// the toggle collapses: a gap band + the changes highlighted — the
		// header splits by surface: the desktop keeps the two cells over the
		// region columns; the mobile gets the ONE file-header (the
		// DiffFileHeader component — the unified view's future shape)
		await fireEvent.click(getByRole('button', { name: 'Changed only' }));
		await vi.waitFor(() => expect(getByText(/1 unchanged line/)).toBeTruthy());
		expect(getByRole('button', { name: 'Show all lines' })).toBeTruthy();
		expect(getAllByText('saved (head) · rev 3', { selector: 'h2' })).toHaveLength(1); // the desktop cell
		expect(getAllByText('pending', { selector: 'h2' })).toHaveLength(2); // the cell + the single header
		expect(getAllByText(/forked from rev 3/)).toHaveLength(2); // the cell's note + the single header's
		// the chevron collapses THIS view's body too (the shared mdOpen —
		// one comparison body): two chevrons render (the single header's +
		// the desktop cell's), either obeys
		await fireEvent.click(getAllByRole('button', { name: 'Collapse diff' })[0]);
		expect(() => getByText(/1 unchanged line/)).toThrow();
		expect(getAllByText('pending', { selector: 'h2' })).toHaveLength(2); // the headers stay
		await fireEvent.click(getAllByRole('button', { name: 'Expand diff' })[0]);
		await vi.waitFor(() => expect(getByText(/1 unchanged line/)).toBeTruthy());
		// the trailing token is a real, visible add — never an invisible strip
		expect(getByText('asdkjasdkj')).toBeTruthy();
		expect(getByText('EDITED')).toBeTruthy();
	});

	describe('the inline view (the unified)', () => {
		it('flattens to the two number bars: one − line, the + lines, the same lines both-numbered', async () => {
			localStorage.setItem(bufferKey('a-post'), JSON.stringify(PENDING));
			const { getByRole, getByText, getAllByText } = render(Fixture);
			await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
			await fireEvent.click(getByRole('button', { name: 'Inline' }));
			// the flattening: 1 del (the sign alone in red), 3 adds, the same
			// lines carry NO sign — the sign column is EMPTY for them
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
			const { getByRole, getByText, getAllByText } = render(Fixture);
			await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
			await fireEvent.click(getByRole('button', { name: 'Inline' }));
			await fireEvent.click(getByRole('button', { name: 'Changed only' }));
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

		it('the remembered choice wins on the next visit', async () => {
			localStorage.setItem(bufferKey('a-post'), JSON.stringify(PENDING));
			localStorage.setItem('mellon.diff-view', 'inline');
			const { getByRole, getAllByText } = render(Fixture);
			await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
			// the inline body WITHOUT the toggle tap — the memory rode in
			expect(getAllByText('−')).toHaveLength(1);
			expect(getByRole('button', { name: 'Split' })).toBeTruthy();
			// back to split: the two-cell headers return
			await fireEvent.click(getByRole('button', { name: 'Split' }));
			await vi.waitFor(() =>
				expect(
					getAllByText('saved (head) · rev 3', { selector: 'h2' }).length
				).toBeGreaterThanOrEqual(1)
			);
			expect(localStorage.getItem('mellon.diff-view')).toBe('split');
		});
	});
});
