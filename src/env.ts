import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	API_BASE: {
		// server-only module ($app/env/private); read here for validation/docs, used via process.env
		schema: (value) => value,
		description:
			'Legacy single upstream: the base URL of ONE lumen serving BOTH planes, ' +
			'SERVER-SIDE ONLY. Superseded by ADMIN_URL + CMS_URL (lumen role split, ' +
			'2026-11-13) but still honored — when set without them it feeds both. ' +
			'Unset everywhere = the dev fallback http://localhost:8080 (single-binary dev). ' +
			"The browser NEVER talks to lumen directly — every call rides mellon's " +
			'same-origin /api relay.'
	},
	ADMIN_URL: {
		schema: (value) => value,
		description:
			'Control-plane lumen (lumen-admin, in-cluster, SERVER-SIDE ONLY): sessions, ' +
			'users, setup TOFU, the Bao secrets plane. Always lumen-admin in the cluster. ' +
			'Path classes live in src/lib/api/routing.ts.'
	},
	CMS_URL: {
		schema: (value) => value,
		description:
			"This environment's content lumen (SERVER-SIDE ONLY): posts, photos, tags, " +
			'collections, media, search, public /api passthroughs. The staging console ' +
			'gets the staging service; same image as production, different env. ' +
			'Path classes live in src/lib/api/routing.ts.'
	}
});
