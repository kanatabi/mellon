/**
 * The theme contract (the theming round, 2026-11-23): ONE composite cookie
 * (`theme=<themeId>-<mode>`) is the source of truth; the layout load resolves
 * it into the PAIR the pre-paint script sets as TWO attributes before first
 * paint — `data-theme` (the palette family) and `data-mode` (light|dark).
 * Anything absent/unknown falls back to `portal-light`. The two-value era's
 * legacy cookie values (`light` / `dark`) resolve as the portal theme, so an
 * existing browser upgrades without a flash.
 *
 * earendil keeps its own two-value theme cookie on its own domain — this
 * contract is mellon's, shaped so new theme ids extend the allowlist without
 * touching the mode machinery. The mode half is what the `dark:` custom
 * variant keys on (`[data-mode='dark']`, layout.css), which is why every
 * theme must ship both modes (owner scoping call).
 */
export type ThemeMode = 'light' | 'dark';

/** The allowlist — builtin ids the resolver accepts. The registry
 *  (theme-registry.ts) gives each id its name/preview; the palette test
 *  pins the two together. `custom-*` ids ride a SHAPE check (the body
 *  lives in localStorage — the server can't know it; the client's ghost
 *  fallback owns existence). */
export const THEME_IDS = ['portal', 'catppuccin', 'tokyonight'] as const;
export type BuiltinThemeId = (typeof THEME_IDS)[number];
export type ThemeId = BuiltinThemeId | `custom-${string}` | `anp-${string}`;
export interface ThemePair {
	theme: ThemeId;
	mode: ThemeMode;
}

const MODES: readonly ThemeMode[] = ['light', 'dark'];
const CUSTOM_ID_RE = /^(?:custom|anp)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function resolveThemePair(cookieValue: string | undefined): ThemePair {
	const v = (cookieValue ?? '').trim();
	// legacy two-value cookies (the 2026-11-16 era) resolve as the portal
	if (v === 'dark' || v === 'portal-dark') return { theme: 'portal', mode: 'dark' };
	if (v === 'light' || v === 'portal-light') return { theme: 'portal', mode: 'light' };
	const [id] = v.split('-');
	const mode = v.slice(v.lastIndexOf('-') + 1); // customs may carry dashes: the mode is ALWAYS the last segment
	if (MODES.includes(mode as ThemeMode)) {
		if ((THEME_IDS as readonly string[]).includes(id))
			return { theme: id as BuiltinThemeId, mode: mode as ThemeMode };
		// the prefixed namespaces (custom bodies in localStorage, the
		// generated anp- set) ride a SHAPE check on the theme-id PORTION —
		// the mode is always the last dash segment, the id may carry dashes
		const themePart = v.slice(0, v.lastIndexOf('-'));
		if (CUSTOM_ID_RE.test(themePart))
			return { theme: themePart as ThemeId, mode: mode as ThemeMode };
	}
	return { theme: 'portal', mode: 'light' };
}

/** The cookie serialization — the inverse of `resolveThemePair`. */
export function themeCookie({ theme, mode }: ThemePair): string {
	return `${theme}-${mode}`;
}
