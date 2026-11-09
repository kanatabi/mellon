import { describe, expect, it } from 'vitest';
import { placeInto, posOf, sanitizeOrder } from './pane-order.ts';

/** The drag/reorder corruption the owner hit lived in these semantics —
 *  they are now pinned as unit tests (no browser, no localStorage: place()
 *  is pure data shape). */
describe('SectionSet.place — landing semantics', () => {
	const MOV = ['a', 'b', 'c', 'd'];
	const PIN = 'actions';
	const mk = () => [...MOV];

	it('null target lands LAST, not first (the reported "lands somewhere else")', () => {
		expect(placeInto(mk(), PIN, 'a', null)).toEqual(['b', 'c', 'd', 'a']);
	});

	it('before-target inserts immediately before it', () => {
		expect(placeInto(mk(), PIN, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
	});

	it('the pinned id as target means first movable', () => {
		expect(placeInto(mk(), PIN, 'c', 'actions')).toEqual(['c', 'a', 'b', 'd']);
	});

	it('pos: pin is 0, movables from 1 (header -1 lives outside)', () => {
		const o = mk();
		expect(posOf(PIN, o, 'actions')).toBe(0);
		expect(posOf(PIN, o, 'a')).toBe(1);
		expect(posOf(PIN, o, 'd')).toBe(4);
	});

	it('unknown/absent ids are refused, order untouched; the pin never moves', () => {
		expect(placeInto(mk(), PIN, 'actions', 'a')).toEqual(MOV);
		expect(placeInto(mk(), PIN, 'ghost-id', 'a')).toEqual(MOV);
	});

	it('rearranging twice composes (no randomness between drops)', () => {
		let o = placeInto(mk(), PIN, 'a', 'c');
		o = placeInto(o, PIN, 'd', 'b');
		expect(o).toEqual(['d', 'b', 'a', 'c']);
	});

	it('persisted garbage is rejected, never adopted', () => {
		expect(sanitizeOrder(['x', 'y'], MOV)).toBeNull();
		expect(sanitizeOrder(['a', 'b', 'c', 'd'], MOV)).toEqual(MOV);
	});
});
