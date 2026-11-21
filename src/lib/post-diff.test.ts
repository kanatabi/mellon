import { describe, expect, it } from 'vitest';
import { changedFieldNames, fieldRows, splitMarkdown, splitRegions, toDraft } from './post-diff.ts';
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

describe('fieldRows — the metadata tab (the vault table view)', () => {
	it('emits EVERY rail field with a status — body EXCLUDED (its home is the markdown tab)', () => {
		const rows = fieldRows(
			draft({ title: 'New', date: '2026-11-01', content: 'changed body' }),
			draft()
		);
		expect(rows.map((r) => r.label)).toEqual([
			'title',
			'subtitle',
			'preview',
			'date',
			'tags',
			'cover'
		]);
		expect(rows.map((r) => r.status)).toEqual([
			'changed',
			'same',
			'same',
			'changed',
			'same',
			'same'
		]);
		// the body NEVER appears as a row — even when it changed
		expect(rows.some((r) => r.key === 'content')).toBe(false);
	});
	it('serializes tags comma-joined', () => {
		const rows = fieldRows(draft({ tags: ['a', 'b'] }), draft());
		const tags = rows.find((r) => r.key === 'tags');
		expect(tags).toMatchObject({ from: 'x', to: 'a, b', status: 'changed' });
	});
	it('a null cover flips the row to changed with empty from', () => {
		const rows = fieldRows(draft({ thumbnail: 'img' }), draft());
		expect(rows.find((r) => r.key === 'thumbnail')).toMatchObject({
			from: '',
			to: 'img',
			status: 'changed'
		});
	});
});

describe('splitRegions — the "Changed only" view', () => {
	it('collapses a single middle edit to ONE region (leading/trailing silence = no band)', () => {
		const base = draft({ content: Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') });
		const pending = draft({
			content: base.content.replace('line 30', 'line 30 edited')
		});
		const regions = splitRegions(base, pending, 2);
		const blocks = regions.filter((r) => r.kind === 'rows');
		expect(blocks).toHaveLength(1); // one contiguous change region
		// no band: the unchanged lines BEFORE the first region and AFTER the
		// last one are silent (GitHub-style), only BETWEEN regions is banded
		expect(regions.filter((r) => r.kind === 'gap')).toHaveLength(0);
		const block = regions[0] as Extract<(typeof regions)[number], { kind: 'rows' }>;
		const rowKinds = block.rows.map((r) => [r.left?.kind, r.right?.kind]);
		expect(rowKinds.some(([l, r]) => l === 'del' && r === 'add')).toBe(true);
	});

	it('bands the unchanged lines BETWEEN two regions', () => {
		const base = draft({ content: 'l0\nl1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9' });
		const pending = draft({
			content: 'l0\nl1\nl2\nl3\nEDITED\nl5\nl6\nl7\nl8\nl9\n\nasdkjasdkj'
		});
		const regions = splitRegions(base, pending, 2);
		// region 1: l2..l6 (5 rows) · gap: l7 only (l8/l9 ride region 2's
		// context) · region 2: l8, l9 + the two adds
		expect(regions.filter((r) => r.kind === 'gap')).toEqual([{ kind: 'gap', count: 1 }]);
		expect(regions.filter((r) => r.kind === 'rows')).toHaveLength(2);
	});

	it('keeps a TRAILING add visible inside its region (the hidden-token case)', () => {
		const base = draft({ content: 'a\nb' });
		const pending = draft({ content: 'a\nb\n\n\nasdkjasdkj' });
		const regions = splitRegions(base, pending, 2);
		const blocks = regions.filter((r) => r.kind === 'rows');
		const allRows = blocks.flatMap((r) => (r.kind === 'rows' ? r.rows : []));
		// the token lands as a real add row — never an invisible lone strip
		expect(allRows.some((r) => r.right?.text === 'asdkjasdkj' && r.right?.kind === 'add')).toBe(
			true
		);
	});

	it('identical bodies → one gap, zero regions', () => {
		const regions = splitRegions(draft(), draft());
		expect(regions).toEqual([{ kind: 'gap', count: 3 }]);
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
