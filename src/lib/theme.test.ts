import { describe, expect, it } from 'vitest';
import { resolveThemePair, themeCookie } from './theme.ts';

/**
 * The theme cookie contract (the theming round, 2026-11-23): ONE composite
 * cookie `theme=<themeId>-<mode>`, anything absent/unknown → portal-light,
 * and the legacy two-value era's values upgrade in place (an existing
 * browser must not flash or lose its mode).
 */
describe('resolveThemePair', () => {
	it('the composite form round-trips through themeCookie', () => {
		expect(resolveThemePair('portal-dark')).toEqual({ theme: 'portal', mode: 'dark' });
		expect(resolveThemePair('portal-light')).toEqual({ theme: 'portal', mode: 'light' });
		expect(themeCookie({ theme: 'portal', mode: 'dark' })).toBe('portal-dark');
	});

	it('the legacy two-value era upgrades in place', () => {
		expect(resolveThemePair('dark')).toEqual({ theme: 'portal', mode: 'dark' });
		expect(resolveThemePair('light')).toEqual({ theme: 'portal', mode: 'light' });
	});

	it('absent, unknown, or malformed falls back to portal-light', () => {
		expect(resolveThemePair(undefined)).toEqual({ theme: 'portal', mode: 'light' });
		expect(resolveThemePair('')).toEqual({ theme: 'portal', mode: 'light' });
		expect(resolveThemePair('nord')).toEqual({ theme: 'portal', mode: 'light' });
		expect(resolveThemePair('portal-night')).toEqual({ theme: 'portal', mode: 'light' });
		expect(resolveThemePair('dracula-dark')).toEqual({ theme: 'portal', mode: 'light' });
		expect(resolveThemePair('portal-dark; evil')).toEqual({ theme: 'portal', mode: 'light' });
	});

	it('custom-* ids ride the SHAPE check — the body lives client-side', () => {
		expect(resolveThemePair('custom-midnight-dark')).toEqual({
			theme: 'custom-midnight',
			mode: 'dark'
		});
		expect(resolveThemePair('custom-solarized-light')).toEqual({
			theme: 'custom-solarized',
			mode: 'light'
		});
		// a custom id without a mode, or with an upper-case slug, is noise
		expect(resolveThemePair('custom-midnight')).toEqual({ theme: 'portal', mode: 'light' });
		expect(resolveThemePair('custom-Midnight-dark')).toEqual({ theme: 'portal', mode: 'light' });
	});
});
