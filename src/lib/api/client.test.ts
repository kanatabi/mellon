/**
 * The relayed-error surface, pinned offline (no plane, no DOM): every hop
 * from lumen's 403 body to the vault page's message pill must ship the wire
 * copy VERBATIM — the ghost-field doctrine made structural. The browser
 * client and the server-side fetch-adapter are stubbed at global fetch with
 * lumen's exact answer; errorText is what the UI actually renders.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, client, errorText } from './client.ts';
import { createLumenApi } from './fetch-adapter.ts';
import { AdminApiError } from './types.ts';

const LOCK_COPY = 'pinned at v2 — unpin first'; // lumen 28e7811 wire contract

/** Stub the network with a fixed status + JSON body. */
function stubResponse(status: number, body: unknown) {
	vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => vi.unstubAllGlobals());

describe('errorText — the UI’s only error-to-copy mapping', () => {
	it('ships ApiError (relayed server copy) verbatim, no decoration', () => {
		const e = new ApiError(403, LOCK_COPY);
		expect(errorText(e)).toBe(LOCK_COPY); // NOT String(e)’s "ApiError: …" prefix
	});
	it('falls back to String() only for non-API failures', () => {
		expect(errorText(new Error('plain'))).toBe('Error: plain');
		expect(errorText('boom')).toBe('boom');
	});
});

describe('browser client call() — relay surface', () => {
	it('a pinned CAS write throws ApiError 403 carrying the wire copy', async () => {
		stubResponse(403, { error: LOCK_COPY });
		const e = (await client.writeSecret('app', 'dev', { A: '1' }, 2).catch((x) => x)) as ApiError;
		expect(e).toBeInstanceOf(ApiError);
		expect(e.status).toBe(403);
		expect(errorText(e)).toBe(LOCK_COPY); // the vault message pill renders this EXACT string
	});
	it('a body without an error field degrades to the honest status line', async () => {
		stubResponse(400, {});
		const e = (await client.unpinSecret('app', 'dev').catch((x) => x)) as ApiError;
		expect(e.status).toBe(400);
		expect(e.message).toBe('request failed (400)');
	});
});

describe('fetch-adapter call() — lumen surface', () => {
	it('maps the 403 to AdminApiError with the copy verbatim (relay never decides)', async () => {
		stubResponse(403, { error: LOCK_COPY });
		const api = createLumenApi('http://lumen.test', 'token');
		const e = (await api.writeSecret('app', 'dev', { A: '1' }, 2).catch((x) => x)) as AdminApiError;
		expect(e).toBeInstanceOf(AdminApiError);
		expect(e.status).toBe(403);
		expect(e.message).toBe(LOCK_COPY);
	});
});
