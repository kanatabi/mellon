import { describe, expect, it } from 'vitest';
import { changedFieldNames, fieldRows, splitMarkdown, toDraft } from './post-diff.ts';
import type { PostDraft } from './api/types.ts';

const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
	slug: 'a-post',
	title: 'A post',
	subtitle: 'sub',
	preview: '',
	date: '2026-11-21',
	tags: ['x'],
	content: 'one\ntwo\nthree',
	thumbnail: null,
	...over
});

describe('changedFieldNames — the dialog list (names only)', () => {
	it('lists exactly the changed attributes, in rail order', () => {
		const pending = draft({ title: 'New', tags: ['x', 'y'], content: 'one\ntwo\nTHREE' });
		expect(changedFieldNames(pending, draft())).toEqual(['title', 'tags', 'body']);
	});
	it('an identical draft changes nothing', () => {
		expect(changedFieldNames(draft(), draft())).toEqual([]);
	});
	it('a null cover counts as a change', () => {
		expect(changedFieldNames(draft({ thumbnail: 'img' }), draft())).toEqual(['cover']);
	});
});

describe('fieldRows — the metadata tab', () => {
	it('emits one row per changed field, saved value left / pending right', () => {
		const rows = fieldRows(draft({ title: 'New', date: '2026-11-01' }), draft());
		expect(rows).toEqual([
			{ key: 'title', label: 'title', from: 'A post', to: 'New' },
			{ key: 'date', label: 'date', from: '2026-11-21', to: '2026-11-01' }
		]);
	});
	it('serializes tags comma-joined', () => {
		const rows = fieldRows(draft({ tags: ['a', 'b'] }), draft());
		expect(rows[0]).toMatchObject({ label: 'tags', from: 'x', to: 'a, b' });
	});
});

describe('splitMarkdown — the two-pane body diff', () => {
	it('pairs changed lines and null-pads the shorter side', () => {
		const rows = splitMarkdown(draft(), draft({ content: 'one\nTWO\nthree\nfour' }));
		// one same row, then the two-line change block (del TWO / add TWO,null
		// pairing via alignDiff), then the added "four"
		const kinds = rows.map((r) => [r.left?.kind ?? null, r.right?.kind ?? null]);
		expect(kinds[0]).toEqual(['same', 'same']);
		expect(kinds).toContainEqual(['del', 'add']);
		expect(kinds).toContainEqual([null, 'add']);
		const texts = rows.map((r) => `${r.left?.text ?? ''}|${r.right?.text ?? ''}`);
		expect(texts).toContain('two|TWO');
		expect(texts).toContain('|four');
	});
	it('identical bodies produce all-same rows', () => {
		const rows = splitMarkdown(draft(), draft());
		expect(rows.every((r) => r.left?.kind === 'same' && r.right?.kind === 'same')).toBe(true);
	});
});

describe('toDraft', () => {
	it('copies tags — mutating the result never touches the source', () => {
		const detail = draft({ tags: ['a'] });
		const copy = toDraft(detail);
		copy.tags.push('b');
		expect(detail.tags).toEqual(['a']);
	});
});
