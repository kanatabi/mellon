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
		const { getByRole, getByText, getAllByText } = render(Fixture);
		await vi.waitFor(() => expect(getByRole('button', { name: 'Save' })).toBeTruthy());
		// the head's identity = the mobile's TRACE ROW's title + the md+'s
		// column header (the snippet's own labels = removed — the trace's
		// title carries it, the owner's dedup); the l0 line renders in the
		// both modes' both sides
		expect(getAllByText('saved (head) · rev 3')).toHaveLength(2);
		expect(getAllByText('l0').length).toBeGreaterThanOrEqual(2);
		// the toggle collapses: a gap band + the changes highlighted
		await fireEvent.click(getByRole('button', { name: 'Changed only' }));
		await vi.waitFor(() => expect(getByText(/1 unchanged line/)).toBeTruthy());
		expect(getByRole('button', { name: 'Show all lines' })).toBeTruthy();
		// the trailing token is a real, visible add — never an invisible strip
		expect(getByText('asdkjasdkj')).toBeTruthy();
		expect(getByText('EDITED')).toBeTruthy();
	});
});
