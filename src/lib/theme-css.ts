import { CORE_TOKENS, type CoreTokens } from './theme-registry.ts';
import type { ThemeId, ThemeMode } from './theme.ts';

/**
 * Read a theme's token block out of the app's OWN stylesheets. The CSS
 * block is the values' source of truth — and the fork flow needs the mode
 * you are NOT wearing, which `getComputedStyle` can never give (it only
 * sees the worn cascade). Same-origin stylesheets expose `cssRules`, so
 * the browser parses its own build output for us; cross-origin sheets
 * throw on access and are skipped. Token blocks live at the top level
 * (not inside at-rules) by construction.
 */
export function readThemeTokens(id: ThemeId, mode: ThemeMode): Partial<CoreTokens> {
	const selector =
		id === 'portal' && mode === 'light' ? ':root' : `[data-theme='${id}'][data-mode='${mode}']`;
	const out: Partial<CoreTokens> = {};
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue; // a sheet we cannot read is not ours to read
		}
		for (const rule of Array.from(rules)) {
			if (!(rule instanceof CSSStyleRule)) continue;
			if (rule.selectorText !== selector) continue;
			for (let i = 0; i < rule.style.length; i++) {
				const prop = rule.style[i];
				if (!prop.startsWith('--')) continue;
				const name = prop.slice(2);
				if (!(CORE_TOKENS as readonly string[]).includes(name)) continue;
				const v = rule.style.getPropertyValue(prop).trim();
				if (v) out[name as keyof CoreTokens] = v;
			}
		}
	}
	return out;
}

/** The worn theme's computed values — the `new` draft's seed and the
 *  preview's fallback. Works for ANY theme (built-ins resolve their CSS
 *  block, customs resolve their inline custom properties). */
export function computedTokens(): Partial<CoreTokens> {
	const cs = getComputedStyle(document.documentElement);
	const out: Partial<CoreTokens> = {};
	for (const t of CORE_TOKENS) {
		const v = cs.getPropertyValue(`--${t}`).trim();
		if (v) out[t as keyof CoreTokens] = v;
	}
	return out;
}
