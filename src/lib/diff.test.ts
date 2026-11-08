import { describe, expect, it } from 'vitest';
import { diffLines } from './diff.ts';

describe('diffLines', () => {
	it('reports pure additions', () => {
		expect(diffLines('A=1', 'A=1\nB=2')).toEqual([
			{ kind: 'same', text: 'A=1' },
			{ kind: 'add', text: 'B=2' }
		]);
	});

	it('reports a value change as del+add', () => {
		expect(diffLines('A=1', 'A=2')).toEqual([
			{ kind: 'del', text: 'A=1' },
			{ kind: 'add', text: 'A=2' }
		]);
	});

	it('empty inputs are all-same or empty', () => {
		expect(diffLines('', '')).toEqual([{ kind: 'same', text: '' }]);
		expect(diffLines('x', '')).toEqual([
			{ kind: 'del', text: 'x' },
			{ kind: 'add', text: '' }
		]);
	});
});
