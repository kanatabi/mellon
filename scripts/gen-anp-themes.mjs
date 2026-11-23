#!/usr/bin/env node
/**
 * Generates mellon's AnuPpuccin themes from AnuPpuccin's own stylesheets
 * (https://github.com/AnubisNekhet/AnuPpuccin — GPL-3.0). The theme
 * re-expresses every colorscheme in the Catppuccin variable style
 * (`--ctp-*` / `--ctp-ext-*: R, G, B`), so the port is MECHANICAL: parse
 * each scheme's values, map them onto mellon's CORE grammar with the
 * documented per-mode table, and emit
 *   1. a generated registry (`theme-registry-anp.gen.ts`), and
 *   2. the CSS blocks (printed to --css) that layout.css carries between
 *      its ANUPPUCCIN markers.
 *
 * Usage:
 *   node scripts/gen-anp-themes.mjs <theme.css> <extended-colorschemes.css> \
 *        --ts src/lib/theme-registry-anp.gen.ts --css /tmp/anp-blocks.css
 *
 * The per-mode mapping (the grammar's roles against catppuccin-style
 * surfaces):
 *   dark:  background←base  card←surface0  chrome←crust  muted←surface1
 *          accent←mantle    border←surface2
 *   light: background←base  card←base lightened 7% (derived — the
 *          elevation trick needs a card ABOVE the canvas)  chrome←crust
 *          muted←surface0  accent←surface1  border←surface2
 *   both:  foreground←text  muted-foreground←subtext0
 *          brand←the scheme's declared --ctp-accent, else mauve
 *          accent-blue←blue  accent-teal←teal  accent-amber←peach
 *          accent-slate←overlay1  danger←red  diff-add←green  diff-del←red
 *
 * Skipped as duplicates: ctp-latte / ctp-mocha (mellon's `catppuccin`
 * theme already carries them).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , themeCssPath, extCssPath, tsFlag, tsOut, cssFlag, cssOut] = process.argv;
if (!themeCssPath || !extCssPath || tsFlag !== '--ts' || !tsOut || cssFlag !== '--css' || !cssOut) {
	console.error(
		'usage: gen-anp-themes.mjs <theme.css> <extended.css> --ts <out.ts> --css <out.css>'
	);
	process.exit(1);
}

/** Every colorscheme the two stylesheets offer (from their @settings YAML
 *  `value: ctp-<x>` options) — the whitelist that keeps stray selectors
 *  (accent-choice classes, amoled overrides) out of the parse. */
function schemesFromYaml(css) {
	const schemes = new Set();
	for (const m of css.matchAll(/^\s*value:\s*ctp-([a-z0-9-]+)\s*$/gm)) {
		schemes.add(m[1].replace(/-(light|dark)$/, ''));
	}
	return schemes;
}

const HEX = (r, g, b) =>
	`#${[r, g, b]
		.map((x) =>
			Math.max(0, Math.min(255, Math.round(x)))
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;
const MIX_WHITE = (hex, t) => {
	const p = parseHex(hex);
	return HEX(p.r + (255 - p.r) * t, p.g + (255 - p.g) * t, p.b + (255 - p.b) * t);
};
function parseHex(value) {
	const h = /^#([0-9a-f]{6})$/.exec(value)[1];
	return {
		r: parseInt(h.slice(0, 2), 16),
		g: parseInt(h.slice(2, 4), 16),
		b: parseInt(h.slice(4, 6), 16)
	};
}

/** scheme → { light?: {name: hex}, dark?: {name: hex}, accent?: {light?, dark?} } */
function parsePalettes(path, schemes) {
	const css = readFileSync(path, 'utf8');
	const out = {};
	const block = /([^{}]+)\{([^{}]*)\}/g;
	let m;
	while ((m = block.exec(css))) {
		const selector = m[1];
		const body = m[2];
		const schemeMatch = /\.ctp-([a-z0-9-]+)(?![a-z-])/.exec(selector);
		if (!schemeMatch) continue;
		const scheme = schemeMatch[1].replace(/-(light|dark)$/, '');
		if (!schemes.has(scheme)) continue;
		const mode = /theme-light|ext-light/.test(selector)
			? 'light'
			: /theme-dark|ext-dark/.test(selector)
				? 'dark'
				: null;
		if (!mode) continue;
		out[scheme] ??= { accent: {} };
		for (const v of body.matchAll(/--ctp-(?:ext-)?([a-z0-9]+):\s*([^;}]+)[;}]/g)) {
			const nums = [...v[2].matchAll(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)];
			if (!nums.length) continue;
			const [r, g, b] = nums[nums.length - 1].slice(1).map(Number);
			const hex = HEX(r, g, b);
			if (v[1] === 'accent') out[scheme].accent[mode] = hex;
			else out[scheme][mode] ??= {};
			if (v[1] !== 'accent') out[scheme][mode][v[1]] = hex;
		}
	}
	return out;
}

const NAMES = {
	rosepine: 'Rosé Pine',
	frappe: 'Frappé',
	macchiato: 'Macchiato',
	'mocha-old': 'Mocha Old',
	atom: 'Atom',
	biscuit: 'Biscuit',
	coffee: 'Coffee',
	dracula: 'Dracula',
	everforest: 'Everforest',
	flexoki: 'Flexoki',
	gruvbox: 'Gruvbox',
	kanagawa: 'Kanagawa',
	'material-mint': 'Material Mint',
	luminescence: 'Luminescence',
	nord: 'Nord',
	'nord-darker': 'Nord Darker',
	notion: 'Notion',
	rosebox: 'Rosebox',
	'royal-velvet': 'Royal Velvet',
	'sandy-beaches': 'Sandy Beaches',
	solarized: 'Solarized',
	thorns: 'Thorns',
	amoled: 'AMOLED',
	generic: 'Generic'
};
const SKIP = new Set(['latte', 'mocha']); // mellon's `catppuccin` theme carries them

const schemes = schemesFromYaml(readFileSync(themeCssPath, 'utf8'));
schemesFromYaml(readFileSync(extCssPath, 'utf8')).forEach((s) => schemes.add(s));
const palettes = { ...parsePalettes(themeCssPath, schemes), ...parsePalettes(extCssPath, schemes) };

/** map(palette, mode) → the 16 CORE tokens. */
function mapTokens(p, mode) {
	const g = (name) => p[mode]?.[name];
	const base = g('base');
	if (!base) return null;
	const card = mode === 'dark' ? g('surface0') : MIX_WHITE(base, 0.07);
	return {
		background: base,
		card,
		chrome: g('crust'),
		muted: mode === 'dark' ? g('surface1') : g('surface0'),
		accent: mode === 'dark' ? g('mantle') : g('surface1'),
		border: g('surface2'),
		foreground: g('text'),
		'muted-foreground': g('subtext0'),
		brand: p.accent?.[mode] ?? g('mauve'),
		'accent-blue': g('blue'),
		'accent-teal': g('teal'),
		'accent-amber': g('peach'),
		'accent-slate': g('overlay1'),
		danger: g('red'),
		'diff-add': g('green'),
		'diff-del': g('red')
	};
}

const PREVIEW_KEYS = [
	'background',
	'card',
	'foreground',
	'border',
	'muted',
	'brand',
	'danger',
	'accent-amber'
];

const themes = [];
const cssBlocks = [];
for (const [scheme, p] of Object.entries(palettes)) {
	if (SKIP.has(scheme) || !NAMES[scheme]) continue;
	const modes = ['light', 'dark'].filter((m) => p[m]?.base);
	if (!modes.length) continue;
	const mapped = {};
	for (const mode of modes) {
		const t = mapTokens(p, mode);
		if (!t) continue;
		mapped[mode] = t;
		const vars = Object.entries(t)
			.map(([k, v]) => `\t\t--${k}: ${v};`)
			.join('\n');
		cssBlocks.push(`[data-theme='anp-${scheme}'][data-mode='${mode}'] {\n${vars}\n}`);
	}
	const preview = {};
	for (const mode of modes) {
		preview[mode] = Object.fromEntries(PREVIEW_KEYS.map((k) => [k, mapped[mode][k]]));
	}
	themes.push({
		id: `anp-${scheme}`,
		name: NAMES[scheme],
		family: 'anuppuccin',
		modes,
		preview
	});
}

const ts = `/**
 * GENERATED by scripts/gen-anp-themes.mjs — do not edit by hand.
 * Source: AnuPpuccin (https://github.com/AnubisNekhet/AnuPpuccin),
 * an Obsidian theme by AnubisNekhet, GPL-3.0 — palette values extracted
 * mechanically from its stylesheets and mapped onto mellon's CORE token
 * grammar (the mapping table lives in the generator). The CSS blocks
 * these values pin live in layout.css between the ANUPPUCCIN markers,
 * carrying the license attribution.
 */
export const ANP_THEMES = ${JSON.stringify(themes, null, '\t')};
`;
writeFileSync(tsOut, ts);

const css = `/* ═══ ANUPPUCCIN — GENERATED (scripts/gen-anp-themes.mjs), begin ═══
   Palette values from AnuPpuccin — https://github.com/AnubisNekhet/AnuPpuccin
   an Obsidian theme by AnubisNekhet, licensed GPL-3.0. Per that license the
   notice is preserved here; if you redistribute this file, keep the credit
   (and the author's link: https://www.buymeacoffee.com/anubisnekhet).
   Values mapped onto mellon's CORE grammar by scripts/gen-anp-themes.mjs —
   regenerate, never hand-edit. */
${cssBlocks.join('\n\n')}
/* ═══ ANUPPUCCIN — GENERATED, end ═══ */`;
writeFileSync(cssOut, css);

console.log(`generated ${themes.length} themes: ${themes.map((t) => t.id).join(', ')}`);
