import { describe, expect, it } from 'vitest';
import {
	alignDiff,
	diffSecrets,
	displayValue,
	orderEnvs,
	tableDiff,
	toParsedLines,
	toRawJson
} from './secrets-diff.ts';

describe('secrets-diff (pure compare engine)', () => {
	it('displayValue: short values are plain, long values dot-capped, reveal wins', () => {
		expect(displayValue('dev', false)).toBe('dev');
		expect(displayValue('abcdefgh', false)).toBe('••••••••');
		expect(displayValue('x'.repeat(30), false)).toBe('••••••••••••'); // capped at 12
		expect(displayValue('x'.repeat(30), true)).toBe('x'.repeat(30));
	});

	it('parsed lines are sorted KEY=value (insert order never fakes a diff)', () => {
		const a = toParsedLines({ B: '2', A: '1' }, true);
		expect(a.split('\n')).toEqual(['A=1', 'B=2']);
	});

	it('raw JSON masks BEFORE serializing — raw view leaks nothing by default', () => {
		const raw = toRawJson({ SECRET: 'a-long-secret-value' }, false);
		expect(raw).not.toContain('a-long-secret-value');
		expect(raw).toContain('•');
		expect(toRawJson({ SECRET: 'a-long-secret-value' }, true)).toContain('a-long-secret-value');
	});

	it('diffSecrets: identical payloads collapse to one same-row, empties are honest', () => {
		const ops = diffSecrets({ A: '1' }, { A: '1' }, 'parsed', false);
		expect(ops).toEqual([{ kind: 'same', text: 'A=1' }]);
		const empty = diffSecrets({}, {}, 'parsed', false);
		expect(empty[0].text).toContain('∅');
	});

	it('alignDiff pairs del/add runs index-for-index and null-pads the shorter side', () => {
		const ops = diffSecrets({ A: '1', B: '2' }, { A: '9', C: '3' }, 'parsed', true);
		// parsed: A=1,B=2 vs A=9,C=3 → del A=1, del B=2, add A=9, add C=3? LCS on lines:
		// no common lines → dels(2) then adds(2) → paired, no padding here.
		const rows = alignDiff(ops);
		expect(rows.length).toBe(2); // max(2 dels, 2 adds)
		expect(rows[0].left?.kind).toBe('del');
		expect(rows[0].right?.kind).toBe('add');
		// padding case: 1 del vs 3 adds
		const pad = alignDiff([
			{ kind: 'del', text: 'X' },
			{ kind: 'add', text: '1' },
			{ kind: 'add', text: '2' },
			{ kind: 'add', text: '3' }
		]);
		expect(pad.length).toBe(3);
		expect(pad[0]).toEqual({ left: { kind: 'del', text: 'X' }, right: { kind: 'add', text: '1' } });
		expect(pad[1].left).toBeNull();
		expect(pad[2].left).toBeNull();
		// same rows pair with themselves on both sides
		const same = alignDiff([{ kind: 'same', text: 'S' }]);
		expect(same).toEqual([
			{ left: { kind: 'same', text: 'S' }, right: { kind: 'same', text: 'S' } }
		]);
	});

	it('split panes always have EQUAL row counts (the alignment guarantee)', () => {
		const rows = alignDiff(diffSecrets({ K: 'v1-longer-value' }, {}, 'raw', false));
		const left = rows.filter((r) => r.left !== null).length;
		const right = rows.filter((r) => r.right !== null).length;
		expect(rows.length).toBe(Math.max(left, right));
	});

	it('tableDiff: per-key statuses over the union, sorted', () => {
		const rows = tableDiff(
			{ GONE: 'x', SAME: '1', CHANGED: 'a' },
			{ SAME: '1', CHANGED: 'b', NEW: 'n' }
		);
		expect(rows.map((r) => [r.key, r.status])).toEqual([
			['CHANGED', 'changed'],
			['GONE', 'removed'],
			['NEW', 'added'],
			['SAME', 'same']
		]);
		expect(rows.find((r) => r.status === 'removed')?.to).toBeNull();
		expect(rows.find((r) => r.status === 'added')?.from).toBeNull();
		// values carried raw for the CELL — masking is the view's job (reveal-aware)
		expect(rows.find((r) => r.key === 'CHANGED')?.from).toBe('a');
	});

	it('orderEnvs: dev → staging → production, exotics alphabetically after', () => {
		expect(orderEnvs(['production', 'staging', 'dev'])).toEqual(['dev', 'staging', 'production']);
		expect(orderEnvs(['lab', 'staging', 'dev', 'beta'])).toEqual(['dev', 'staging', 'beta', 'lab']);
	});
});
