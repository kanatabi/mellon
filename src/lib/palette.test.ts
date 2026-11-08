import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Palette doctrine guards (§11.3 wayfinding amendment): every color token must
 * exist in BOTH the light `:root` and the `[data-theme='dark']` block — a
 * token defined in one theme only is a guaranteed wrong-color pixel in the
 * other. Text-level guard because vitest runs node without DOM.
 */
const css = readFileSync(new URL('../routes/layout.css', import.meta.url), 'utf8');

function block(selector: RegExp): string {
	const m = css.match(selector);
	if (!m) throw new Error(`token block not found: ${selector}`);
	return m[0];
}

const light = block(/:root\s*\{[^}]*\}/);
const dark = block(/\[data-theme='dark'\]\s*\{[^}]*\}/);

const TOKENS = [
	'--background',
	'--foreground',
	'--card',
	'--primary',
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

describe('palette parity (§11.3)', () => {
	it('every token is defined in light AND dark', () => {
		for (const t of TOKENS) {
			expect(light, `${t} missing from :root`).toContain(`${t}:`);
			expect(dark, `${t} missing from [data-theme='dark']`).toContain(`${t}:`);
		}
	});

	it('every token has a @theme inline mapping (tailwind classes exist)', () => {
		const theme = block(/@theme inline\s*\{[^}]*\}/s);
		for (const t of TOKENS) {
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
