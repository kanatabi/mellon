import { resolveTheme } from '#lib/theme.ts';
import { parseAutosaveSeconds } from '#lib/pending-edit.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => ({
	theme: resolveTheme(cookies.get('theme')),
	// Editor autosave staleness bound (seconds): vault-fed (kv/mellon/shared
	// via the app-config feed), code-default 60 when unset/invalid — dev and
	// bare-k3d never seed it and never should have to.
	autosaveSeconds: parseAutosaveSeconds(process.env['EDITOR_AUTOSAVE_SECONDS'])
});
