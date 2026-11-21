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
	it('the blank-line seam BRIDGES linearly (no freeze-then-snap)', () => {
		const gapped: LineMap = {
			anchors: [
				{ start: 1, end: 1, top: 0, bottom: 50 },
				{ start: 5, end: 5, top: 100, bottom: 150 }
			],
			total: 150
		};
		// the source lines [2, 5) = the seam: the px ramps 50 → 100 across them
		expect(offsetForLine(gapped, 2)).toBe(50);
		expect(offsetForLine(gapped, 3)).toBeCloseTo(66.6667, 4);
		expect(offsetForLine(gapped, 4)).toBeCloseTo(83.3333, 4);
		// monotonic across the whole doc — no backward jumps
		const seq = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((l) => offsetForLine(gapped, l));
		for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
	});
});

describe('lineForOffset — preview fold → editor line', () => {
	it('interpolates within a block (FLOAT line) and clamps at the edges', () => {
		expect(lineForOffset(MAP, 0)).toBe(1);
		expect(lineForOffset(MAP, 50)).toBe(2);
		expect(lineForOffset(MAP, 100)).toBe(3);
		expect(lineForOffset(MAP, 250)).toBe(6);
		expect(lineForOffset(MAP, 379)).toBeCloseTo(9.9625, 6);
		expect(lineForOffset(MAP, 999)).toBe(9);
	});
	it('the sub-line fraction survives (the pixel-continuous feed)', () => {
		// offset 95 = 95% through block 1 → the float line 2.9 (the OLD floor
		// dropped the fraction = the line-height jumps = the jagged chase)
		expect(lineForOffset(MAP, 95)).toBeCloseTo(2.9, 6);
	});
	it('a px seam maps back through the bridge (the inverse map)', () => {
		const gapped: LineMap = {
			anchors: [
				{ start: 1, end: 1, top: 0, bottom: 50 },
				{ start: 5, end: 5, top: 100, bottom: 150 }
			],
			total: 150
		};
		// the px 75 = the seam's midpoint → the line 3.5 (the bridge's midpoint)
		expect(lineForOffset(gapped, 75)).toBe(3.5);
	});
	it('round-trips both directions', () => {
		for (const line of [1, 2, 4, 7, 9]) {
			expect(lineForOffset(MAP, offsetForLine(MAP, line))).toBe(line);
		}
	});
	it('round-trips through the seams (offset → line → offset = the identity)', () => {
		const gapped: LineMap = {
			anchors: [
				{ start: 1, end: 1, top: 0, bottom: 50 },
				{ start: 5, end: 5, top: 100, bottom: 150 }
			],
			total: 150
		};
		for (const offset of [55, 75, 95]) {
			const line = lineForOffset(gapped, offset);
			expect(offsetForLine(gapped, line)).toBeCloseTo(offset, 6);
		}
	});
});
