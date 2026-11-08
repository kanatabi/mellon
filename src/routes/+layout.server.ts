import { resolveTheme } from '#lib/theme.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => ({
	theme: resolveTheme(cookies.get('theme'))
});
