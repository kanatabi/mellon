/**
 * The correlation seam's contract (2026-11-15): every outbound lumen call
 * mints and sends an id, failures log WITH it, and lumen's echo lands in
 * the thrown error — one id chains the portal hop to the backend's logs.
 * Stubbed at global fetch with lumen's exact answers, like client.test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLumenApi } from './fetch-adapter.ts';
import { AdminApiError } from './types.ts';
import { REQUEST_ID_HEADER, newRequestId, logAccess } from './requestid.ts';
import { upstreamFor } from './routing.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('newRequestId', () => {
	it('mints a UUID v4, fresh every call', () => {
		expect(newRequestId()).toMatch(UUID);
		expect(newRequestId()).not.toBe(newRequestId());
	});
});

describe('the fetch-adapter seam', () => {
	it('sends x-request-id on every call — a fresh one each time', async () => {
		const seen: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string | URL, init?: RequestInit) => {
				seen.push(new Headers(init?.headers).get(REQUEST_ID_HEADER) ?? '');
				return Response.json([]);
			})
		);
		const api = createLumenApi('http://lumen.test', 'tok');
		await api.listTags();
		await api.listTags();
		expect(seen).toHaveLength(2);
		expect(seen[0]).toMatch(UUID);
		expect(seen[1]).toMatch(UUID);
		expect(seen[0]).not.toBe(seen[1]);
	});

	it('captures the echoed id from lumen into AdminApiError', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ error: 'pinned at v2 — unpin first' }), {
						status: 403,
						headers: { [REQUEST_ID_HEADER]: 'lumen-minted-1' }
					})
			)
		);
		const api = createLumenApi('http://lumen.test', 'tok');
		const err = (await api
			.writeSecret('app', 'dev', { A: '1' }, 2)
			.catch((x: unknown) => x)) as AdminApiError;
		expect(err).toBeInstanceOf(AdminApiError);
		expect(err.status).toBe(403);
		expect(err.message).toBe('pinned at v2 — unpin first'); // the wire copy is untouched
		expect(err.requestId).toBe('lumen-minted-1');
	});

	it('a network failure is a 503 carrying the MINTED id', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED');
			})
		);
		const api = createLumenApi('http://lumen.test', 'tok');
		const err = (await api.listTags().catch((x: unknown) => x)) as AdminApiError;
		expect(err.status).toBe(503);
		expect(err.requestId).toMatch(UUID);
	});

	it('the hop in the access line comes from the routing table', () => {
		expect(upstreamFor('/admin/tags')).toBe('cms');
		expect(upstreamFor('/admin/session')).toBe('admin');
	});
});

describe('logAccess', () => {
	it('the failure line carries the id, hop, and path', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		logAccess('cms', 'POST', '/admin/photos', 500, 'req-42');
		expect(errSpy).toHaveBeenCalledOnce();
		const line = String(errSpy.mock.calls[0]?.[0]);
		expect(line).toContain('request_id=req-42');
		expect(line).toContain('hop=cms');
		expect(line).toContain('path=/admin/photos');
	});

	it('successes speak without error level', () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		logAccess('admin', 'GET', '/admin/bao/summary', 200, 'req-7');
		expect(logSpy).toHaveBeenCalledOnce();
		expect(errSpy).not.toHaveBeenCalled();
	});

	it('the query string never logs (the path is the safe surface)', () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		logAccess('cms', 'GET', '/admin/posts', 200, 'req-8');
		expect(String(logSpy.mock.calls[0]?.[0])).not.toContain('?');
	});
});
