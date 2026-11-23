import { CORE_TOKENS, PREVIEW_TOKENS, type CoreTokens, type ThemeDef } from './theme-registry.ts';
import type { ThemeMode } from './theme.ts';

/**
 * The custom theme contract (the theming round 2, 2026-11-23): a theme is
 * DATA — a name + the full CORE token grammar for BOTH modes — stored in
 * localStorage (`mellon.theme.custom.<slug>`, 2–3 KB), applied through the
 * same seam the built-ins ride (inline custom properties on <html>, which
 * out-rank every CSS block in the cascade). Validation is structural:
 * every CORE token present, every value a real color. Arbitrary CSS never
 * executes — the CSS import lifts custom-property DECLARATIONS out of a
 * detached stylesheet and discards the rest (the injection guard IS the
 * design).
 */
export interface CustomTheme {
	id: `custom-${string}`;
	name: string;
	tokens: Record<ThemeMode, CoreTokens>;
}

export type PartialTokens = Record<ThemeMode, Partial<CoreTokens>>;

export class ThemeValidationError extends Error {
	constructor(readonly issues: string[]) {
		super(`invalid theme: ${issues.join('; ')}`);
		this.name = 'ThemeValidationError';
	}
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'theme'
	);
}

/** Color validation: `CSS.supports` where it exists (the browser, which
 *  knows every function form); a strict shape allowlist in node (the
 *  tests). Either way an arbitrary string can never become a custom
 *  property value. */
export function isValidColor(v: unknown): v is string {
	if (typeof v !== 'string') return false;
	const s = v.trim();
	if (!s || s.length > 100) return false;
	if (typeof CSS !== 'undefined' && typeof CSS?.supports === 'function')
		return CSS.supports('color', s);
	return /^(#[0-9a-fA-F]{3,8}|rgb(a)?\([^()]*\)|oklch\([^()]*\)|hsl\([^()]*\)|lab\([^()]*\))$/.test(
		s
	);
}

/** Structural validation — the localStorage reader and the import path
 *  both funnel through here, so nothing reaches the apply seam unshaped. */
export function validateCustomTheme(input: unknown): CustomTheme {
	const issues: string[] = [];
	if (typeof input !== 'object' || input === null)
		throw new ThemeValidationError(['not an object']);
	const o = input as Record<string, unknown>;
	const name = typeof o.name === 'string' ? o.name.trim() : '';
	if (!name) issues.push('a name is required');
	const tokens = (o.tokens ?? {}) as Record<string, unknown>;
	for (const mode of ['light', 'dark'] as const) {
		const modeTokens = (tokens[mode] ?? {}) as Record<string, unknown>;
		for (const t of CORE_TOKENS) {
			const v = modeTokens[t];
			if (v === undefined) issues.push(`${mode}/${t} missing`);
			else if (!isValidColor(v))
				issues.push(`${mode}/${t} is not a color: ${String(v).slice(0, 40)}`);
		}
	}
	if (issues.length) throw new ThemeValidationError(issues);
	const clean = (mode: ThemeMode): CoreTokens => {
		const out = {} as CoreTokens;
		for (const t of CORE_TOKENS)
			out[t] = String((tokens[mode] as Record<string, unknown>)[t]).trim();
		return out;
	};
	const id =
		typeof o.id === 'string' && o.id.startsWith('custom-') && SLUG_RE.test(o.id.slice(7))
			? (o.id as CustomTheme['id'])
			: (`custom-${slugify(name)}` as CustomTheme['id']);
	return { id, name, tokens: { light: clean('light'), dark: clean('dark') } };
}

/** Assemble a draft into a theme: fill CORE-token gaps from `fillBase`
 *  (the fork's base or the current theme's computed values), then
 *  validate — the caller shows ThemeValidationError's issues. */
export function assembleTheme(
	name: string,
	partial: PartialTokens,
	fillBase?: Record<ThemeMode, Partial<CoreTokens>>
): CustomTheme {
	const tokens: Record<ThemeMode, Partial<CoreTokens>> = { light: {}, dark: {} };
	for (const mode of ['light', 'dark'] as const) {
		for (const t of CORE_TOKENS) {
			const v = partial[mode][t] ?? fillBase?.[mode]?.[t];
			if (v !== undefined) tokens[mode][t] = v;
		}
	}
	return validateCustomTheme({ name, tokens });
}

/** A loose read of pasted JSON — structure only, no validation (the
 *  assembler owns that). Returns null when it isn't theme-shaped at all. */
export function parseThemeJson(text: string): { name: string; partial: PartialTokens } | null {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
	const o = data as Record<string, unknown>;
	const tokens = (o.tokens ?? {}) as Record<string, unknown>;
	const pick = (mode: string): Partial<CoreTokens> => {
		const out: Partial<CoreTokens> = {};
		const m = (tokens[mode] ?? {}) as Record<string, unknown>;
		for (const t of CORE_TOKENS) if (typeof m[t] === 'string') out[t] = (m[t] as string).trim();
		return out;
	};
	return {
		name: typeof o.name === 'string' ? o.name.trim() : '',
		partial: { light: pick('light'), dark: pick('dark') }
	};
}

/**
 * The CSS import: shadcn-style theme files declare variables under
 * `:root` (the light half) and `.dark` / a dark-mode attribute (the dark
 * half). Parse via a DETACHED stylesheet — the browser does the work —
 * and lift ONLY custom-property declarations of the CORE grammar;
 * everything else in the file (selectors, at-rules, urls) is discarded,
 * so arbitrary CSS can never be applied. Unknown variables are ignored
 * (a mellon theme is exactly its CORE grammar).
 */
export function parseThemeCss(text: string): { partial: PartialTokens; issues: string[] } {
	const partial: PartialTokens = { light: {}, dark: {} };
	const issues: string[] = [];
	const doc = document.implementation.createHTMLDocument('theme-import');
	const style = doc.createElement('style');
	style.textContent = text;
	doc.head.appendChild(style);
	const sheet = style.sheet;
	if (!sheet) {
		issues.push('the browser refused to parse that CSS');
		return { partial, issues };
	}
	for (const rule of Array.from(sheet.cssRules)) {
		if (!(rule instanceof CSSStyleRule)) continue; // @media/@supports etc: a theme file's vars live at the top level
		const sel = rule.selectorText ?? '';
		if (
			!/(^|,)\s*(:root|html|\.dark|html\.dark|\[data-mode=[^\]]*dark\]|\[data-theme[^\]]*)\s*($|,)/.test(
				sel
			)
		)
			continue;
		const isDark =
			/dark/.test(sel) && !/:root/.test(sel.replace(/\[data-mode=['"]?light['"]\]/g, ''));
		const style_ = rule.style;
		for (let i = 0; i < style_.length; i++) {
			const prop = style_[i];
			if (!prop.startsWith('--')) continue;
			const name = prop.slice(2);
			if (!(CORE_TOKENS as readonly string[]).includes(name)) continue;
			const v = style_.getPropertyValue(prop).trim();
			if (v) (isDark ? partial.dark : partial.light)[name as keyof CoreTokens] = v as string;
		}
	}
	for (const mode of ['light', 'dark'] as const) {
		const missing = CORE_TOKENS.filter((t) => partial[mode][t] === undefined);
		if (missing.length) issues.push(`${mode}: ${missing.length} token(s) not found in the file`);
	}
	return { partial, issues };
}

/** The picker's view of a custom theme — the same shape the built-ins
 *  wear, preview tokens picked out of the full body. */
export function toThemeDef(t: CustomTheme): ThemeDef {
	const pick = (tokens: CoreTokens): Record<string, string> =>
		Object.fromEntries(PREVIEW_TOKENS.map((k) => [k, tokens[k]]));
	return {
		id: t.id,
		name: t.name,
		family: 'custom',
		modes: ['light', 'dark'],
		preview: { light: pick(t.tokens.light), dark: pick(t.tokens.dark) }
	};
}
