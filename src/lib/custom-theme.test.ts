import { describe, expect, it } from 'vitest';
import {
	assembleTheme,
	isValidColor,
	parseThemeJson,
	slugify,
	ThemeValidationError,
	validateCustomTheme
} from './custom-theme.ts';
import { PORTAL_THEME } from './theme-registry.ts';
import type { CoreTokens } from './theme-registry.ts';

/**
 * The custom theme contract (the theming round 2), node-side: structural
 * validation is the ONLY door into the apply seam — every CORE token, both
 * modes, every value a real color. The CSS-import parser is DOM-bound and
 * lives in the .dom. battery.
 */
const base = PORTAL_THEME.preview;
const tokens = (p: Record<string, string>): CoreTokens => {
	// stretch the 8 swatch tokens into a full CORE set (the rest from portal's
	// known values — the palette test pins those against the CSS)
	return {
		background: p.background ?? '#f8f7fb',
		foreground: p.foreground ?? '#171521',
		card: p.card ?? '#ffffff',
		muted: p.muted ?? '#edeaf6',
		'muted-foreground': '#6f6a80',
		accent: '#ece8f4',
		border: p.border ?? '#dcd6e9',
		chrome: '#f1eef8',
		brand: p.brand ?? '#7c3aed',
		'accent-blue': '#6366f1',
		'accent-teal': '#0d9488',
		'accent-amber': p['accent-amber'] ?? '#d97706',
		'accent-slate': '#64748b',
		danger: p.danger ?? '#b91c1c',
		'diff-add': '#15803d',
		'diff-del': '#b91c1c'
	};
};

const validTokens = { light: tokens(base.light), dark: tokens(base.dark) };

describe('isValidColor', () => {
	it('accepts the honest color forms, rejects everything else', () => {
		expect(isValidColor('#fff')).toBe(true);
		expect(isValidColor('#7c3aed')).toBe(true);
		expect(isValidColor('oklch(0.55 0.25 295)')).toBe(true);
		expect(isValidColor('rgb(1 2 3)')).toBe(true);
		expect(isValidColor('red')).toBe(false); // keywords stay out: the grammar is values-only
		expect(isValidColor('var(--brand)')).toBe(false); // a var reference would chain into nothing
		expect(isValidColor('url(//evil)')).toBe(false);
		expect(isValidColor('')).toBe(false);
		expect(isValidColor(42)).toBe(false);
	});
});

describe('validateCustomTheme', () => {
	it('accepts a complete, well-formed theme and derives the id from the name', () => {
		const t = validateCustomTheme({ name: 'Midnight Ink', tokens: validTokens });
		expect(t.id).toBe('custom-midnight-ink');
		expect(t.name).toBe('Midnight Ink');
		expect(Object.keys(t.tokens.light)).toHaveLength(16);
	});

	it('honors an existing well-shaped id (a rename must not re-slug)', () => {
		const t = validateCustomTheme({
			id: 'custom-older-slug',
			name: 'New Name',
			tokens: validTokens
		});
		expect(t.id).toBe('custom-older-slug');
	});

	it('missing tokens, bad colors, or no name are listed — never partial-applied', () => {
		try {
			validateCustomTheme({ name: '', tokens: { light: {}, dark: {} } });
			throw new Error('should have thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(ThemeValidationError);
			const issues = (e as ThemeValidationError).issues;
			expect(issues.some((i) => i.includes('a name is required'))).toBe(true);
			expect(issues.filter((i) => i.includes('missing')).length).toBe(32); // 16 × 2 modes
		}
	});

	it('a non-color value names the token and the value', () => {
		const bad = { light: { ...validTokens.light, brand: 'url(//evil)' }, dark: validTokens.dark };
		expect(() => validateCustomTheme({ name: 'x', tokens: bad })).toThrow(/light\/brand/);
	});
});

describe('assembleTheme (the import path)', () => {
	it('fills gaps from the base (the theme you are wearing) and validates the result', () => {
		const t = assembleTheme(
			'midnight',
			{ light: { brand: '#111111' }, dark: { brand: '#eeeeee' } },
			validTokens
		);
		expect(t.tokens.light.brand).toBe('#111111');
		expect(t.tokens.light.foreground).toBe(validTokens.light.foreground);
		expect(t.tokens.dark.brand).toBe('#eeeeee');
	});

	it('with no base, gaps stay gaps and validation refuses', () => {
		expect(() => assembleTheme('x', { light: { brand: '#111' }, dark: {} })).toThrow(
			ThemeValidationError
		);
	});
});

describe('parseThemeJson', () => {
	it('reads the native shape loosely; garbage is null, not a throw', () => {
		const parsed = parseThemeJson(
			JSON.stringify({ name: 'Ink', tokens: { light: { brand: '#111' }, dark: {} } })
		);
		expect(parsed?.name).toBe('Ink');
		expect(parsed?.partial.light.brand).toBe('#111');
		expect(parseThemeJson('not json')).toBeNull();
		expect(parseThemeJson('[1,2,3]')).toBeNull();
		expect(parseThemeJson('"just a string"')).toBeNull();
		// unknown tokens are IGNORED — a mellon theme is exactly its CORE grammar
		const extra = parseThemeJson(
			JSON.stringify({ name: 'x', tokens: { light: { brand: '#111', '--evil': 'url(x)' } } })
		);
		expect(Object.keys(extra?.partial.light ?? {})).toEqual(['brand']);
	});
});

describe('slugify', () => {
	it('names become slugs; punctuation collapses; empty becomes "theme"', () => {
		expect(slugify('Midnight Ink')).toBe('midnight-ink');
		expect(slugify('Catppuccin-ish!')).toBe('catppuccin-ish');
		expect(slugify('   ')).toBe('theme');
	});
});
