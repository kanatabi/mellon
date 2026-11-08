import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme.ts';

describe('theme contract', () => {
	it('resolves the dark cookie to dark', () => {
		expect(resolveTheme('dark')).toBe('dark');
	});

	it('falls back to light for anything else (incl. absent/garbage)', () => {
		expect(resolveTheme(undefined)).toBe('light');
		expect(resolveTheme('light')).toBe('light');
		expect(resolveTheme('neon')).toBe('light');
	});

	it('returns exactly one of the two literal values', () => {
		for (const v of ['dark', 'light', undefined, 'x']) {
			expect(['light', 'dark']).toContain(resolveTheme(v));
		}
	});
});
