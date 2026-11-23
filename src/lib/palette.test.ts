import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PREVIEW_TOKENS, THEMES } from './theme-registry.ts';

/**
 * Palette doctrine guards (§11.3 wayfinding amendment): every color token must
 * exist in BOTH the light `:root` and the `[data-theme='dark']` block — a
 * token defined in one theme only is a guaranteed wrong-color pixel in the
 * other. Text-level guard because vitest runs node without DOM.
 *
 * Amended in S1 (SHADCN.md §3.2): there are now two KINDS of token.
 *
 *   CORE   — literal hex values. Must be declared in BOTH blocks; that is the
 *            original rule, unchanged.
 *   ALIAS  — the shadcn vocabulary. Declared ONCE in `:root` as `var(--core)`,
 *            and theme-safe BY CONSTRUCTION: the referent flips in the dark
 *            block, so the alias flips with it through the cascade. Demanding
 *            a duplicate declaration here would only create two places to
 *            diverge — so the guard instead proves the CHAIN lands on a
 *            dual-defined core token. `--primary` moved from CORE to ALIAS in
 *            S1 (it is `var(--brand)` now, not a literal).
 */
const css = readFileSync(new URL('../routes/layout.css', import.meta.url), 'utf8');

function block(selector: RegExp): string {
	const m = css.match(selector);
	if (!m) throw new Error(`token block not found: ${selector}`);
	return m[0];
}

const light = block(/:root\s*\{[^}]*\}/);
const dark = block(/\[data-theme='portal'\]\[data-mode='dark'\]\s*\{[^}]*\}/);

/** Declared value of `token` inside a block, or undefined. */
function value(scope: string, token: string): string | undefined {
	return scope.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1].trim();
}

const CORE = [
	'--background',
	'--foreground',
	'--card',
	'--muted',
	'--muted-foreground',
	'--accent',
	'--border',
	'--chrome',
	'--brand',
	'--accent-blue',
	'--accent-teal',
	'--accent-amber',
	'--accent-slate',
	'--danger',
	'--diff-add',
	'--diff-del'
];

// parity + the registry both read ONE grammar (the theming round): the
// bare names are CORE_TOKENS; the `--` forms are this test's CSS lens.
const CORE_NAMES = CORE.map((t) => t.slice(2));

/** The shadcn vocabulary, all `var(--core)` except the deliberately
 *  transparent sidebar border (§11.1: one chrome mass, no internal hairline). */
const ALIAS = [
	'--primary',
	'--primary-foreground',
	'--secondary',
	'--secondary-foreground',
	'--popover',
	'--popover-foreground',
	'--input',
	'--ring',
	'--destructive',
	'--destructive-foreground',
	'--sidebar',
	'--sidebar-foreground',
	'--sidebar-primary',
	'--sidebar-primary-foreground',
	'--sidebar-accent',
	'--sidebar-accent-foreground',
	'--sidebar-border',
	'--sidebar-ring'
];

/** Walk `var(--x)` links to the token that finally holds a real value. */
function finalTarget(token: string): string | undefined {
	let cur = token;
	for (let hop = 0; hop < 8; hop++) {
		const v = value(light, cur);
		if (v === undefined) return undefined;
		const m = v.match(/^var\((--[a-z0-9-]+)\)$/);
		if (!m) return cur;
		if (m[1] === cur) return undefined;
		cur = m[1];
	}
	return undefined;
}

describe('palette parity (§11.3)', () => {
	it('every CORE token is defined in light AND dark', () => {
		for (const t of CORE) {
			expect(light, `${t} missing from :root`).toContain(`${t}:`);
			expect(dark, `${t} missing from [data-theme='dark']`).toContain(`${t}:`);
		}
	});

	it('every ALIAS resolves to a dual-defined token (so it flips by cascade)', () => {
		for (const t of ALIAS) {
			expect(value(light, t), `${t} missing from :root`).toBeTruthy();
			const target = finalTarget(t);
			expect(target, `${t} does not resolve to a literal`).toBeTruthy();
			if (target === t) {
				// Declared with a literal: legal ONLY when it is theme-independent.
				expect(value(light, t), `${t} is a literal and must be theme-agnostic`).toBe('transparent');
			} else {
				expect(CORE, `${t} resolves to ${target}, which is not dual-defined`).toContain(target);
			}
		}
	});

	it('every token has a @theme inline mapping (tailwind classes exist)', () => {
		const theme = block(/@theme inline\s*\{[^}]*\}/s);
		for (const t of [...CORE, ...ALIAS]) {
			expect(theme, `--color${t.slice(1)} not mapped`).toContain(`--color${t.slice(1)}`);
		}
	});

	it('hex values are real colors, light block uses whisper-indigo hue (not zinc)', () => {
		// §11.3 amendment: mellon neutrals carry a violet/indigo cast —
		// background/foreground in light must NOT be the plain-zinc values
		expect(light).not.toContain('--background: #ffffff;');
		expect(light).toMatch(/--background: #\w{6};/);
		expect(dark).not.toContain('--background: #09090b;');
	});
});

/**
 * The registry ↔ CSS pin (the theming round, 2026-11-23): every registered
 * theme × mode must have a CSS block defining every CORE token, and the
 * registry's swatch preview values must EQUAL the CSS values — a registry
 * drift is a test failure, not a wrong swatch on the picker. The portal's
 * LIGHT values live in `:root` (the cascade's fallback floor); every other
 * block is `[data-theme='…'][data-mode='…']`.
 */
function blockFor(id: string, mode: string): string {
	if (id === 'portal' && mode === 'light') return light;
	return block(new RegExp(`\\[data-theme='${id}'\\]\\[data-mode='${mode}'\\]\\s*\\{[^}]*\\}`));
}

describe('theme registry ↔ CSS', () => {
	it('every registered theme ships its OWN modes, each with every CORE token', () => {
		for (const theme of THEMES) {
			for (const mode of theme.modes) {
				const scope = blockFor(theme.id, mode);
				for (const t of CORE_NAMES) {
					expect(scope, `${theme.id}-${mode}: --${t} missing`).toContain(`--${t}:`);
				}
			}
		}
	});

	it('the registry swatch preview values EQUAL the CSS values', () => {
		for (const theme of THEMES) {
			for (const mode of theme.modes) {
				const scope = blockFor(theme.id, mode);
				for (const key of PREVIEW_TOKENS) {
					const expected = theme.preview[mode][key];
					expect(
						expected,
						`${theme.id}-${mode}: preview token ${key} missing in registry`
					).toBeTruthy();
					const actual = value(scope, `--${key}`);
					expect(actual, `${theme.id}-${mode}: --${key} registry/CSS drift`).toBe(expected);
				}
			}
		}
	});
});
