import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json({ ok: true, app: 'mellon' }, { headers: { 'cache-control': 'no-store' } });
