import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
const dark = block(/\[data-theme='dark'\]\s*\{[^}]*\}/);

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
