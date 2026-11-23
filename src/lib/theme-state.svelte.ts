import type { ThemeId, ThemeMode, ThemePair } from './theme.ts';

/**
 * Runtime theme state, shared by the app chrome and the login screen (both
 * render the toggle), the settings page (segment control + theme grid) and
 * the command palette — ONE behavior behind every door. The SSR cookie +
 * pre-paint script own first paint; this store only tracks post-hydration
 * flips (View Transitions cross-fade).
 */
export const themeState = $state({
	theme: 'portal' as ThemeId,
	mode: 'light' as ThemeMode
});

export function syncThemeFromServer(pair: ThemePair) {
	themeState.theme = pair.theme;
	themeState.mode = pair.mode;
}

/** The single write path: store + both data attributes + cookie, VT-animated. */
export function setTheme(next: ThemeId, mode?: ThemeMode) {
	const apply = () => {
		themeState.theme = next;
		if (mode) themeState.mode = mode;
		document.documentElement.dataset.theme = themeState.theme;
		document.documentElement.dataset.mode = themeState.mode;
		document.cookie = `theme=${themeState.theme}-${themeState.mode}; path=/; max-age=31536000; samesite=strict`;
	};
	if (document.startViewTransition) document.startViewTransition(apply);
	else apply();
}

/** The mode flip within the current theme — the toggle's whole job. */
export function setMode(mode: ThemeMode) {
	setTheme(themeState.theme, mode);
}

export function toggleMode() {
	setMode(themeState.mode === 'dark' ? 'light' : 'dark');
}
