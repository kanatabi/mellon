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

/** The allowlist — ids the resolver accepts. The registry (theme-registry.ts)
 *  gives each id its name/preview; the palette test pins the two together. */
export const THEME_IDS = ['portal', 'catppuccin', 'tokyonight'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export interface ThemePair {
	theme: ThemeId;
	mode: ThemeMode;
}

const MODES: readonly ThemeMode[] = ['light', 'dark'];

export function resolveThemePair(cookieValue: string | undefined): ThemePair {
	const v = (cookieValue ?? '').trim();
	// legacy two-value cookies (the 2026-11-16 era) resolve as the portal
	if (v === 'dark' || v === 'portal-dark') return { theme: 'portal', mode: 'dark' };
	if (v === 'light' || v === 'portal-light') return { theme: 'portal', mode: 'light' };
	const [id, mode] = v.split('-');
	if ((THEME_IDS as readonly string[]).includes(id) && MODES.includes(mode as ThemeMode))
		return { theme: id as ThemeId, mode: mode as ThemeMode };
	return { theme: 'portal', mode: 'light' };
}

/** The cookie serialization — the inverse of `resolveThemePair`. */
export function themeCookie({ theme, mode }: ThemePair): string {
	return `${theme}-${mode}`;
}
