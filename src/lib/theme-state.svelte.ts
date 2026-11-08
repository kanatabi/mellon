import type { Theme } from './theme.ts';

/**
 * Runtime theme state, shared by the app chrome and the login screen (both
 * render the toggle). The SSR cookie + pre-paint script own first paint; this
 * store only tracks post-hydration flips (View Transitions cross-fade).
 */
export const themeState = $state({ theme: 'light' as Theme });

export function syncThemeFromServer(theme: Theme) {
	themeState.theme = theme;
}

export function toggleTheme() {
	const next = themeState.theme === 'dark' ? 'light' : 'dark';
	const apply = () => {
		themeState.theme = next;
		document.documentElement.dataset.theme = next;
		document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=strict`;
	};
	if (document.startViewTransition) document.startViewTransition(apply);
	else apply();
}
