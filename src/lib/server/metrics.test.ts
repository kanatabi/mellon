import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Metric } from 'prom-client';
import {
	DEP,
	OP,
	SERVICE,
	TIMEOUT_TABLE,
	effectiveTimeout,
	httpRequestTotal,
	isProbe,
	observeInbound,
	outbound,
	outboundInflight,
	outboundTotal,
	register,
	timeoutEnvKeys
} from './metrics.js';

// The observability registry's contract (2026-11-15): every lumen call is
// counted with a result axis (ok|error|timeout — a hung lumen is a
// DIFFERENT series from a failed one), the wrapped fn receives the ABORT
// signal so the budget actually bounds it, and the DEPENDENCY axis maps
// from the routing table's two planes (a slow secrets write and a slow
// content read are different problems). The register is shared by the
// hooks and server.js — that's why this module is plain JS.

async function counterValue(vec: Metric<string>, labels: Record<string, string>) {
	const metric = await vec.get();
	for (const v of metric.values) {
		if (Object.entries(labels).every(([k, want]) => v.labels[k] === want)) {
			return v.value;
		}
	}
	return null;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('the registry shape', () => {
	it('carries the static service label on every scraped series', async () => {
		const text = await register.metrics();
		expect(text).toContain('service="' + SERVICE + '"');
		expect(text).toContain('outbound_request_total');
		expect(text).toContain('http_request_total');
	});

	it('the dependency axis maps BOTH planes (the dual-upstream split)', () => {
		expect(DEP.admin).toBe('lumen-admin');
		expect(DEP.cms).toBe('lumen-cms');
	});

	it('the timeout table keys are exactly the dependency labels', () => {
		expect(Object.keys(TIMEOUT_TABLE).sort()).toEqual(['lumen-admin', 'lumen-cms'].sort());
	});
});

describe('effectiveTimeout (missing or empty env = default)', () => {
	it('the table: the upload override wins, the dep default fills the rest', () => {
		expect(effectiveTimeout(DEP.cms, 'photos.upload')).toBe(30000);
		expect(effectiveTimeout(DEP.cms, 'posts.list')).toBe(5000);
		expect(effectiveTimeout(DEP.admin, 'bao.write')).toBe(5000);
	});

	it('env override (dep level) wins over the table', () => {
		vi.stubEnv('MELLON_TIMEOUT_LUMEN_ADMIN', '700');
		expect(effectiveTimeout(DEP.admin, 'users.list')).toBe(700);
	});

	it('the per-op env wins over the dep env', () => {
		vi.stubEnv('MELLON_TIMEOUT_LUMEN_CMS', '700');
		vi.stubEnv('MELLON_TIMEOUT_LUMEN_CMS_PHOTOS_UPLOAD', '15000');
		expect(effectiveTimeout(DEP.cms, 'photos.upload')).toBe(15000);
		expect(effectiveTimeout(DEP.cms, 'posts.list')).toBe(700);
	});

	it('EMPTY or garbage env falls back — never a zero or a NaN budget', () => {
		vi.stubEnv('MELLON_TIMEOUT_LUMEN_CMS', '');
		expect(effectiveTimeout(DEP.cms, 'posts.list')).toBe(5000);
		vi.stubEnv('MELLON_TIMEOUT_LUMEN_CMS', 'not-a-number');
		expect(effectiveTimeout(DEP.cms, 'posts.list')).toBe(5000);
		vi.stubEnv('MELLON_TIMEOUT_LUMEN_CMS', '0');
		expect(effectiveTimeout(DEP.cms, 'posts.list')).toBe(5000);
	});

	it('the env keys derive from the table (the machine-readable pair)', () => {
		expect(timeoutEnvKeys(DEP.cms)).toEqual([
			'MELLON_TIMEOUT_LUMEN_CMS',
			'MELLON_TIMEOUT_LUMEN_CMS_PHOTOS_UPLOAD'
		]);
		expect(timeoutEnvKeys(DEP.admin)).toEqual(['MELLON_TIMEOUT_LUMEN_ADMIN']);
	});
});

describe('outbound — the wrapper', () => {
	it('a resolved response is ok even when it carries a 5xx (the transport succeeded)', async () => {
		const before = await counterValue(outboundTotal, {
			dependency: DEP.cms,
			operation: 'posts.list',
			result: 'ok'
		});
		const res = await outbound(
			DEP.cms,
			'posts.list',
			async () => new Response('nope', { status: 500 })
		);
		expect(res.status).toBe(500);
		const after = await counterValue(outboundTotal, {
			dependency: DEP.cms,
			operation: 'posts.list',
			result: 'ok'
		});
		expect(after).toBe((before ?? 0) + 1);
	});

	it('a thrown error is error, and it RETHROWS (instrumentation never swallows)', async () => {
		const before = await counterValue(outboundTotal, {
			dependency: DEP.admin,
			operation: 'bao.read',
			result: 'error'
		});
		const boom = new Error('ECONNREFUSED');
		await expect(outbound(DEP.admin, 'bao.read', () => Promise.reject(boom))).rejects.toBe(boom);
		const after = await counterValue(outboundTotal, {
			dependency: DEP.admin,
			operation: 'bao.read',
			result: 'error'
		});
		expect(after).toBe((before ?? 0) + 1);
	});

	it('a hung call dies at the budget and classifies timeout', async () => {
		vi.stubEnv('MELLON_TIMEOUT_LUMEN_CMS_POSTS_LIST', '30'); // 30ms
		const before = await counterValue(outboundTotal, {
			dependency: DEP.cms,
			operation: 'posts.list',
			result: 'timeout'
		});
		await expect(
			outbound(DEP.cms, 'posts.list', (signal) => {
				return new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(signal.reason));
				});
			})
		).rejects.toMatchObject({ name: 'TimeoutError' });
		const after = await counterValue(outboundTotal, {
			dependency: DEP.cms,
			operation: 'posts.list',
			result: 'timeout'
		});
		expect(after).toBe((before ?? 0) + 1);
	});

	it('the wrapped fn RECEIVES the signal carrying the budget', async () => {
		let received: AbortSignal | undefined;
		await outbound(DEP.admin, 'session.read', (signal) => {
			received = signal;
			return Promise.resolve('x');
		});
		expect(received instanceof AbortSignal).toBe(true);
		expect(received?.aborted).toBe(false);
	});

	it('the in-flight gauge moves up and settles back', async () => {
		const before = await counterValue(outboundInflight, { dependency: DEP.cms });
		let during;
		await outbound(DEP.cms, 'photos.upload', async () => {
			during = await counterValue(outboundInflight, { dependency: DEP.cms });
			return 'x';
		});
		const after = await counterValue(outboundInflight, { dependency: DEP.cms });
		expect(during).toBe((before ?? 0) + 1);
		expect(after).toBe(before ?? 0);
	});
});

describe('the inbound pair', () => {
	it('a null route id records the honest unmatched series', async () => {
		const before = await counterValue(httpRequestTotal, {
			method: 'GET',
			route: 'unmatched',
			status: '404'
		});
		observeInbound(null, 'GET', 404, 1.5);
		const after = await counterValue(httpRequestTotal, {
			method: 'GET',
			route: 'unmatched',
			status: '404'
		});
		expect(after).toBe((before ?? 0) + 1);
	});
});

describe('probes', () => {
	it('the health doors skip', () => {
		expect(isProbe('/healthz')).toBe(true);
		expect(isProbe('/readyz')).toBe(true);
		expect(isProbe('/(app)/posts')).toBe(false);
	});
});

// the adapter's ops are threaded explicitly per call site and TYPED to
// OpName — a misspelled op is a compile error; this guard proves the
// table's override key is a member (the one literal the TABLE carries)
describe('the op vocabulary', () => {
	it('the table\u0027s override key is a member of the registry OP', () => {
		expect(OP.PhotosUpload).toBe('photos.upload');
		expect(Object.keys(TIMEOUT_TABLE[DEP.cms].ops ?? {})).toEqual([OP.PhotosUpload]);
	});
});
