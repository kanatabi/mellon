import { createApi } from '#lib/api/index.ts';
import { SESSION_COOKIE } from '#lib/session.ts';
import type { PageServerLoad } from './$types';

/**
 * Version compare (§11): two versions of ONE path (versions are a per-path
 * fact — cross-env diffing is deliberately not a thing here; values are
 * per-env secrets by doctrine). SSR loads BOTH payloads; every presentation
 * axis (table/split/inline, parsed/raw, reveal) is client-side compute over
 * the same data — the pure module owns the logic, the page owns the pixels.
 */
export const load: PageServerLoad = async ({ url, cookies }) => {
	const api = createApi(cookies.get(SESSION_COOKIE) ?? '');
	const paths = await api.listSecretPaths();
	const app = url.searchParams.get('app') ?? paths[0]?.app ?? '';
	const env = url.searchParams.get('env') ?? paths.find((p) => p.app === app)?.env ?? '';
	if (!app || !env || !paths.some((p) => p.app === app && p.env === env)) {
		return { paths, app, env, meta: null, fromPayload: null, toPayload: null, fromV: 0, toV: 0 };
	}
	const meta = await api.secretMeta(app, env);
	const head = meta?.currentVersion ?? 0;
	const wanted = (name: string, fallback: number): number => {
		const raw = url.searchParams.get(name);
		const n = raw === null ? NaN : Number(raw);
		return Number.isInteger(n) && n >= 1 && n <= Math.max(head, 1) ? n : fallback;
	};
	const toV = wanted('to', head);
	const fromV = wanted('from', Math.max(1, toV > 1 ? toV - 1 : 1));
	const [fromPayload, toPayload] = await Promise.all([
		api.readSecret(app, env, fromV),
		api.readSecret(app, env, toV)
	]);
	return { paths, app, env, meta, fromPayload, toPayload, fromV, toV };
};
