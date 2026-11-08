import type { Theme } from './theme.ts';

/**
 * Runtime theme state, shared by the app chrome and the login screen (both
 * render the toggle), the settings page (segment control) and the command
 * palette (toggle command) — ONE behavior behind three doors. The SSR cookie
 * + pre-paint script own first paint; this store only tracks post-hydration
 * flips (View Transitions cross-fade).
 */
export const themeState = $state({ theme: 'light' as Theme });

export function syncThemeFromServer(theme: Theme) {
	themeState.theme = theme;
}

/** The single write path: store + cookie + data-theme, VT-animated. */
export function setTheme(next: Theme) {
	const apply = () => {
		themeState.theme = next;
		document.documentElement.dataset.theme = next;
		document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=strict`;
	};
	if (document.startViewTransition) document.startViewTransition(apply);
	else apply();
}

export function toggleTheme() {
	setTheme(themeState.theme === 'dark' ? 'light' : 'dark');
}
