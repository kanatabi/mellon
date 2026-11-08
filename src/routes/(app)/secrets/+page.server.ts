import { createApi } from '#lib/api/index.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const api = createApi();
	const paths = await api.listSecretPaths();
	const app = url.searchParams.get('app') ?? paths[0]?.app ?? '';
	const env = url.searchParams.get('env') ?? paths.find((p) => p.app === app)?.env ?? '';
	if (!app || !env) return { paths, app: '', env: '', secret: null, meta: null };
	const [secret, meta] = await Promise.all([api.readSecret(app, env), api.secretMeta(app, env)]);
	if (!secret || !meta) error(404, 'secret path not in policy scope');
	return { paths, app, env, secret, meta };
};
