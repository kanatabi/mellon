import { describe, expect, it } from 'vitest';
import { lineForOffset, offsetForLine, parseSourceLines, type LineMap } from './preview-sync.ts';

// a synthetic 3-block document: lines 1-2 (px 0-100), 3-6 (100-300), 7-9 (300-380)
const MAP: LineMap = {
	anchors: [
		{ start: 1, end: 2, top: 0, bottom: 100 },
		{ start: 3, end: 6, top: 100, bottom: 300 },
		{ start: 7, end: 9, top: 300, bottom: 380 }
	],
	total: 380
};

describe('parseSourceLines', () => {
	it('parses the pipeline attribute; rejects malformed ranges', () => {
		expect(parseSourceLines('12-14')).toEqual({ start: 12, end: 14 });
		expect(parseSourceLines('5-5')).toEqual({ start: 5, end: 5 });
		expect(parseSourceLines(null)).toBeNull();
		expect(parseSourceLines('')).toBeNull();
		expect(parseSourceLines('junk')).toBeNull();
		expect(parseSourceLines('14-12')).toBeNull(); // inverted
	});
});

describe('offsetForLine — editor fold → preview scroll', () => {
	it('interpolates within a block and clamps at the edges', () => {
		expect(offsetForLine(MAP, 1)).toBe(0);
		expect(offsetForLine(MAP, 2)).toBe(50); // halfway through block 1
		expect(offsetForLine(MAP, 3)).toBe(100);
		expect(offsetForLine(MAP, 5)).toBe(200); // middle of block 2
		expect(offsetForLine(MAP, 9)).toBe(380);
		expect(offsetForLine(MAP, 0)).toBe(0); // above the doc
		expect(offsetForLine(MAP, 99)).toBe(380); // below the doc
	});
	it('lands between anchors on the NEXT anchor (blank-line gaps)', () => {
		const gapped: LineMap = {
			anchors: [
				{ start: 1, end: 1, top: 0, bottom: 50 },
				{ start: 5, end: 5, top: 100, bottom: 150 }
			],
			total: 150
		};
		expect(offsetForLine(gapped, 3)).toBe(100); // lines 2-4 have no block
	});
});

describe('lineForOffset — preview fold → editor line', () => {
	it('interpolates within a block and clamps at the edges', () => {
		expect(lineForOffset(MAP, 0)).toBe(1);
		expect(lineForOffset(MAP, 50)).toBe(2);
		expect(lineForOffset(MAP, 100)).toBe(3);
		expect(lineForOffset(MAP, 250)).toBe(6);
		expect(lineForOffset(MAP, 379)).toBe(9);
		expect(lineForOffset(MAP, 999)).toBe(9);
	});
	it('a seam below a block reads the block ABOVE (margins, not jumps)', () => {
		// offset 95 sits between block 1's bottom (100) — reads line 2, not 3
		expect(lineForOffset(MAP, 95)).toBe(2);
	});
	it('round-trips both directions', () => {
		for (const line of [1, 2, 4, 7, 9]) {
			expect(lineForOffset(MAP, offsetForLine(MAP, line))).toBe(line);
		}
	});
});
