import type { ThemeId, ThemeMode } from './theme.ts';

/**
 * The theme registry — the ONE list every surface reads: the settings
 * grid, the palette's theme rows, and the structural palette test. The
 * CSS blocks in layout.css are the VALUES' source of truth; the registry
 * carries identity plus the ~8 swatch tokens per mode, and
 * `palette.test.ts` pins those against the CSS — a registry/CSS drift is
 * a test failure, not a silent wrong swatch.
 *
 * Every theme ships BOTH modes (owner scoping call — themes without an
 * official light half stay out until one is derived and verified).
 */
export interface ThemeDef {
	id: ThemeId;
	name: string;
	/** The swatch preview's tokens per mode. A SUBSET — enough to feel the
	 *  palette: the card on its background, its text, its borders and the
	 *  three accent voices. */
	preview: Record<ThemeMode, Record<string, string>>;
}

/** The swatch's token keys, in paint order. ONE list for every theme so
 *  the mini-panes are built by ONE snippet. */
export const PREVIEW_TOKENS = [
	'background',
	'card',
	'foreground',
	'border',
	'muted',
	'brand',
	'danger',
	'accent-amber'
] as const;

/** The CORE token grammar — the values a theme MUST carry (the shadcn
 *  aliases resolve against these and never need re-declaring). The palette
 *  test's parity list and the custom-theme validator both read THIS, so
 *  "required" is defined once. Bare names (no `--`). */
export const CORE_TOKENS = [
	'background',
	'foreground',
	'card',
	'muted',
	'muted-foreground',
	'accent',
	'border',
	'chrome',
	'brand',
	'accent-blue',
	'accent-teal',
	'accent-amber',
	'accent-slate',
	'danger',
	'diff-add',
	'diff-del'
] as const;

export type CoreToken = (typeof CORE_TOKENS)[number];
export type CoreTokens = Record<CoreToken, string>;

export const PORTAL_THEME: ThemeDef = {
	id: 'portal',
	name: 'Portal',
	preview: {
		light: {
			background: '#f8f7fb',
			card: '#ffffff',
			foreground: '#171521',
			border: '#dcd6e9',
			muted: '#edeaf6',
			brand: '#7c3aed',
			danger: '#b91c1c',
			'accent-amber': '#d97706'
		},
		dark: {
			background: '#0f0e17',
			card: '#171522',
			foreground: '#eae8f2',
			border: '#2b2740',
			muted: '#262336',
			brand: '#a78bfa',
			danger: '#f87171',
			'accent-amber': '#fcd34d'
		}
	}
};

export const CATPPUCCIN_THEME: ThemeDef = {
	id: 'catppuccin',
	name: 'catppuccin',
	preview: {
		light: {
			background: '#eff1f5',
			card: '#ffffff',
			foreground: '#4c4f69',
			border: '#ccd0da',
			muted: '#e6e9ef',
			brand: '#8839ef',
			danger: '#d20f39',
			'accent-amber': '#df8e1d'
		},
		dark: {
			background: '#1e1e2e',
			card: '#282839',
			foreground: '#cdd6f4',
			border: '#45475a',
			muted: '#313244',
			brand: '#cba6f7',
			danger: '#f38ba8',
			'accent-amber': '#fab387'
		}
	}
};

export const TOKYONIGHT_THEME: ThemeDef = {
	id: 'tokyonight',
	name: 'tokyonight',
	preview: {
		light: {
			background: '#e1e2e7',
			card: '#eceef4',
			foreground: '#3760bf',
			border: '#c4c8da',
			muted: '#d5d9e5',
			brand: '#7847bd',
			danger: '#f52a65',
			'accent-amber': '#b15c00'
		},
		dark: {
			background: '#1a1b26',
			card: '#1f2335',
			foreground: '#c0caf5',
			border: '#3b4261',
			muted: '#292e42',
			brand: '#bb9af7',
			danger: '#f7768e',
			'accent-amber': '#e0af68'
		}
	}
};

/** The picker's order: the portal's own first, then the ported families. */
export const THEMES: ThemeDef[] = [PORTAL_THEME, CATPPUCCIN_THEME, TOKYONIGHT_THEME];
