// The diff page MOUNTS + reads its pending side from the browser store —
// the layer the node tests can't reach (localStorage, tabs, empty state).
import { render, fireEvent } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fixture from './diff-page-fixture.svelte';
import { bufferKey } from '#lib/pending-edit.ts';

const headPost = {
	slug: 'a-post',
	title: 'A post',
	subtitle: '',
	preview: '',
	date: '2026-11-21',
	tags: [],
	content: 'body',
	thumbnail: null,
	status: 'draft',
	readTime: 1,
	rev: 3,
	createdAt: '2026-11-20T10:00:00Z',
	publishedAt: null,
	updatedAt: '2026-11-20T10:00:00Z'
};

const pendingEdit = {
	slug: 'a-post',
	baseRev: 3,
	at: Date.parse('2026-11-21T12:00:00Z'),
	draft: { ...headPost, title: 'A renamed post', content: 'body\ntwo' }
};

beforeEach(() => localStorage.clear());

describe('the diff page — empty state', () => {
	it('mounts and reports nothing pending when no buffer exists', async () => {
		const { getByText } = render(Fixture);
		await vi.waitFor(() => expect(getByText('nothing pending — the editor is clean')).toBeTruthy());
	});
});

describe('the diff page — pending state', () => {
	it('renders the tabs, the save verb, and the metadata rows from the buffer', async () => {
		localStorage.setItem(bufferKey('a-post'), JSON.stringify(pendingEdit));
		const { getByRole, getByText } = render(Fixture);
		await vi.waitFor(() => expect(getByRole('button', { name: 'save' })).toBeTruthy());
		// switch to the metadata tab — the changed-field row appears
		await fireEvent.click(getByRole('tab', { name: 'Metadata' }));
		expect(getByText('title')).toBeTruthy();
		expect(getByText('A renamed post')).toBeTruthy();
		// no conflict: buffer forked from the head rev
		expect(() => getByRole('alert')).toThrow();
	});
});
