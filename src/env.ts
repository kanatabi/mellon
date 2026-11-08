import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	API_BASE: {
		// server-only module ($app/env/private); read here for validation/docs, used via process.env
		schema: (value) => value,
		description:
			'Internal base URL of the lumen Admin API, SERVER-SIDE ONLY. ' +
			'In the cluster: http://lumen-http-server.lumen.svc.cluster.local. ' +
			'Unset = the in-process mock layer (mock-first doctrine: the portal is fully ' +
			'developable with zero backend services). The browser NEVER talks to lumen ' +
			"directly — every call rides mellon's same-origin /admin-api relay."
	}
});
