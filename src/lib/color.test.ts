import { describe, expect, it } from 'vitest';
import {
	gridMosaic,
	hexToOklch,
	hsvToRgb,
	oklchToHex,
	parseColor,
	parseHex,
	rgbToHex,
	rgbToHsv
} from './color.ts';

/**
 * The picker's color math (the picker follow-up): HSV round-trips are
 * exact-enough (±1/255 per channel — hex quantization), and the oklch
 * bridge is asserted by round-trip against known portal tokens.
 */
const closeHex = (a: string, b: string, tol = 2) => {
	const A = parseHex(a)!,
		B = parseHex(b)!;
	expect(Math.abs(A.r - B.r)).toBeLessThanOrEqual(tol);
	expect(Math.abs(A.g - B.g)).toBeLessThanOrEqual(tol);
	expect(Math.abs(A.b - B.b)).toBeLessThanOrEqual(tol);
};

describe('hex parse/format', () => {
	it('reads every length the token grammar allows', () => {
		expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
		expect(parseHex('#7c3aed')).toEqual({ r: 124, g: 58, b: 237, a: 1 });
		expect(parseHex('#7c3aed80')?.a).toBeCloseTo(0.5, 1);
		expect(parseHex('7c3aed')).toBeNull();
		expect(parseHex('#gggggg')).toBeNull();
	});

	it('writes hex; alpha clamps into [0,1], only real transparency earns the 8-digit form', () => {
		expect(rgbToHex({ r: 124, g: 58, b: 237 })).toBe('#7c3aed');
		expect(rgbToHex({ r: 124, g: 58, b: 237 }, 1)).toBe('#7c3aed');
		expect(rgbToHex({ r: 124, g: 58, b: 237 }, 0.5)).toBe('#7c3aed80');
		expect(rgbToHex({ r: 0, g: 0, b: 0 }, -2)).toBe('#00000000'); // clamped → fully transparent
	});
});

describe('hsv round-trip', () => {
	it('hex → hsv → hex lands back', () => {
		for (const hex of [
			'#7c3aed',
			'#f8f7fb',
			'#0f0e17',
			'#f38ba8',
			'#1abc9c',
			'#000000',
			'#ffffff'
		]) {
			const rgb = parseHex(hex)!;
			closeHex(rgbToHex(hsvToRgb(rgbToHsv(rgb))), hex, 1);
		}
	});

	it('the primary hues survive', () => {
		expect(rgbToHsv(parseHex('#ff0000')!)).toMatchObject({ h: 0, s: 1, v: 1 });
		expect(rgbToHsv(parseHex('#00ff00')!)).toMatchObject({ h: 120, s: 1, v: 1 });
		expect(rgbToHsv(parseHex('#0000ff')!)).toMatchObject({ h: 240, s: 1, v: 1 });
		expect(hsvToRgb({ h: 0, s: 0, v: 0 })).toMatchObject({ r: 0, g: 0, b: 0 });
		expect(hsvToRgb({ h: 0, s: 0, v: 1 })).toMatchObject({ r: 255, g: 255, b: 255 });
	});
});

describe('oklch bridge', () => {
	it('round-trips the portal tokens (±2/255)', () => {
		for (const hex of ['#7c3aed', '#a78bfa', '#f38ba8', '#f8f7fb']) {
			closeHex(oklchToHex(hexToOklch(hex)!), hex, 2);
		}
	});

	it('parses the shapes the grammar allows, with alpha', () => {
		expect(oklchToHex({ l: 0.7, c: 0.1, h: 145 }, 1)).toMatch(/^#[0-9a-f]{6}$/);
		expect(oklchToHex({ l: 0.7, c: 0.1, h: 145 }, 0.5)).toMatch(/80$/);
	});

	it('out-of-gamut clamps instead of exploding', () => {
		const hex = oklchToHex({ l: 1.2, c: 0.5, h: 30 });
		expect(hex).toMatch(/^#[0-9a-f]{6}$/);
	});
});

describe('parseColor (the token-value door)', () => {
	it('knows the three shapes', () => {
		expect(parseColor('#7c3aed')?.g).toBe(58);
		expect(parseColor('rgb(124 58 237)')?.g).toBe(58);
		expect(parseColor('rgba(124 58 237 / 50%)')?.a).toBeCloseTo(0.5, 1);
		// the oklch door: generate the string FROM the token's own conversion,
		// so the parse→convert path is asserted, not a hand-copied constant
		const o = hexToOklch('#7c3aed')!;
		const ok = parseColor(`oklch(${o.l.toFixed(4)} ${o.c.toFixed(4)} ${o.h.toFixed(1)})`);
		expect(ok).not.toBeNull();
		closeHex(rgbToHex(ok!), '#7c3aed', 2);
	});

	it('answers null for anything the picker cannot render', () => {
		expect(parseColor('var(--brand)')).toBeNull();
		expect(parseColor('red')).toBeNull();
		expect(parseColor('hsl(120 50% 50%)')).toBeNull();
		expect(parseColor('')).toBeNull();
	});
});

describe('gridMosaic', () => {
	it('grayscale strip first, then the hue columns; every cell in range', () => {
		const rows = gridMosaic();
		expect(rows[0][0]).toMatchObject({ s: 0 });
		expect(rows).toHaveLength(13); // 1 gray strip (as one row list) + 12 hues
		for (const col of rows.slice(1)) {
			expect(col).toHaveLength(8);
			for (const cell of col) {
				expect(cell.h).toBeGreaterThanOrEqual(0);
				expect(cell.v).toBeLessThanOrEqual(1);
				expect(cell.s).toBeGreaterThan(0);
			}
		}
	});
});
