import type { ThemeId, ThemeMode } from './theme.ts';
import { ANP_THEMES } from './theme-registry-anp.gen.ts';

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
	/** The modes this theme actually ships — the picker renders only
	 *  these (the theming round's both-modes rule relaxed for the
	 *  AnuPpuccin set: Dracula is dark-only, Sandy Beaches light-only). */
	modes: ThemeMode[];
	/** The picker's grouping — section headers, never tabs. */
	family: 'portal' | 'catppuccin' | 'anuppuccin' | 'custom';
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
	modes: ['light', 'dark'],
	family: 'portal',
	preview: {
		light: {
			background: '#f8f7fb',
			foreground: '#171521',
			card: '#ffffff',
			chrome: '#f1eef8',
			muted: '#edeaf6',
			'muted-foreground': '#6f6a80',
			accent: '#ece8f4',
			border: '#dcd6e9',
			brand: '#7c3aed',
			'accent-blue': '#6366f1',
			'accent-teal': '#0d9488',
			'accent-amber': '#d97706',
			'accent-slate': '#64748b',
			danger: '#b91c1c',
			'diff-add': '#15803d',
			'diff-del': '#b91c1c'
		},
		dark: {
			background: '#0f0e17',
			foreground: '#eae8f2',
			card: '#171522',
			chrome: '#0a0911',
			muted: '#262336',
			'muted-foreground': '#9d97b3',
			accent: '#221f31',
			border: '#2b2740',
			brand: '#a78bfa',
			'accent-blue': '#a5b4fc',
			'accent-teal': '#5eead4',
			'accent-amber': '#fcd34d',
			'accent-slate': '#94a3b8',
			danger: '#f87171',
			'diff-add': '#4ade80',
			'diff-del': '#f87171'
		}
	}
};

export const CATPPUCCIN_THEME: ThemeDef = {
	id: 'catppuccin',
	name: 'catppuccin',
	modes: ['light', 'dark'],
	family: 'catppuccin',
	preview: {
		light: {
			background: '#eff1f5',
			foreground: '#4c4f69',
			card: '#ffffff',
			chrome: '#e9ebf1',
			muted: '#e6e9ef',
			'muted-foreground': '#6c6f85',
			accent: '#dce0e8',
			border: '#ccd0da',
			brand: '#8839ef',
			'accent-blue': '#1e66f5',
			'accent-teal': '#179299',
			'accent-amber': '#df8e1d',
			'accent-slate': '#8c8fa1',
			danger: '#d20f39',
			'diff-add': '#40a02b',
			'diff-del': '#d20f39'
		},
		dark: {
			background: '#1e1e2e',
			foreground: '#cdd6f4',
			card: '#282839',
			chrome: '#11111b',
			muted: '#313244',
			'muted-foreground': '#9399b2',
			accent: '#45475a',
			border: '#45475a',
			brand: '#cba6f7',
			'accent-blue': '#89b4fa',
			'accent-teal': '#94e2d5',
			'accent-amber': '#fab387',
			'accent-slate': '#7f849c',
			danger: '#f38ba8',
			'diff-add': '#a6e3a1',
			'diff-del': '#f38ba8'
		}
	}
};

export const TOKYONIGHT_THEME: ThemeDef = {
	id: 'tokyonight',
	name: 'tokyonight',
	modes: ['light', 'dark'],
	family: 'portal',
	preview: {
		light: {
			background: '#e1e2e7',
			foreground: '#3760bf',
			card: '#eceef4',
			chrome: '#d8dae3',
			muted: '#d5d9e5',
			'muted-foreground': '#6172b0',
			accent: '#cfd2e0',
			border: '#c4c8da',
			brand: '#7847bd',
			'accent-blue': '#2e7de9',
			'accent-teal': '#007196',
			'accent-amber': '#b15c00',
			'accent-slate': '#8990b9',
			danger: '#f52a65',
			'diff-add': '#587539',
			'diff-del': '#f52a65'
		},
		dark: {
			background: '#1a1b26',
			foreground: '#c0caf5',
			card: '#1f2335',
			chrome: '#16161e',
			muted: '#292e42',
			'muted-foreground': '#a9b1d6',
			accent: '#3b4261',
			border: '#3b4261',
			brand: '#bb9af7',
			'accent-blue': '#7aa2f7',
			'accent-teal': '#1abc9c',
			'accent-amber': '#e0af68',
			'accent-slate': '#737aa2',
			danger: '#f7768e',
			'diff-add': '#9ece6a',
			'diff-del': '#f7768e'
		}
	}
};

/** The picker's order: the portal's own first, then the ported families. */
/** The picker's grouping — section headers, never tabs. */
export const FAMILIES: { family: ThemeDef['family']; title: string; hint?: string }[] = [
	{ family: 'portal', title: 'Portal', hint: 'the one the estate wears' },
	{ family: 'catppuccin', title: 'Catppuccin', hint: 'the original four-flavor port' },
	{
		family: 'custom',
		title: 'Your themes',
		hint: 'they live in THIS browser — export the JSON to move them'
	},
	{
		family: 'anuppuccin',
		title: 'AnuPpuccin',
		hint: "the Obsidian theme's full palette set — GPL-3.0, credited in the CSS"
	}
];

export const THEMES: ThemeDef[] = [
	PORTAL_THEME,
	CATPPUCCIN_THEME,
	TOKYONIGHT_THEME,
	// generated from AnuPpuccin (scripts/gen-anp-themes.mjs); the literal
	// widens to string — the assertion pins the shape once, here.
	...(ANP_THEMES as unknown as ThemeDef[])
];

/** The modes a theme ships — the segmented and the cookie correction both
 *  read this. */
export function modesOf(id: ThemeId): ThemeMode[] {
	return THEMES.find((t) => t.id === id)?.modes ?? ['light', 'dark'];
}

/** An available mode for the theme, preferring the one requested. */
export function availableMode(id: ThemeId, mode: ThemeMode): ThemeMode {
	const modes = modesOf(id);
	return modes.includes(mode) ? mode : modes[0];
}
