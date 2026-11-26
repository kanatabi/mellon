import { stringify } from 'devalue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionFailure, submitAction } from './action-post.ts';

/**
 * The action wire is TWO layers deep (Kit v3):
 *   1. the JSON envelope `{type, status, location, data}`, and
 *   2. `data` as a devalue STRING (`action_result_json` serializes the
 *      action's return with `stringify`).
 *
 * The previous battery built fixtures with PLAIN OBJECTS in `data` — it
 * proved the intention, not the protocol, and stayed green while the portal
 * crashed twice (`can't access property "publicKey", r is undefined`).
 * Every fixture here goes through `stringify`, exactly like Kit.
 */

type Call = { url: string; init: RequestInit };

function stubFetch(payload: unknown, status = 200): Call[] {
	const calls: Call[] = [];
	const fn = vi.fn(async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return {
			ok: status < 400,
			status,
			text: async () => JSON.stringify(payload)
		} as unknown as Response;
	});
	vi.stubGlobal('fetch', fn);
	return calls;
}

function stubUnparseable(status = 502): void {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: status < 400,
			status,
			text: async () => '<html>proxy error</html>'
		}))
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('submitAction', () => {
	it('posts the named action form-encoded and DECODES the devalue payload', async () => {
		const begin = { state: 's1', options: { publicKey: { challenge: 'c' } } };
		const wire = stringify(begin);
		// the wire shape is a STRING, not an object — the fixture must mirror it
		expect(typeof wire).toBe('string');
		const calls = stubFetch({
			type: 'success',
			status: 200,
			location: '/settings/security',
			data: wire
		});

		const out = await submitAction<typeof begin>('passkeyRegisterBegin', { ready: '1' });

		expect(out).toEqual({ kind: 'data', data: begin });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('?/passkeyRegisterBegin');
		expect(calls[0].init.method).toBe('POST');
		expect(calls[0].init.body?.toString()).toBe('ready=1');
		const headers = calls[0].init.headers as Record<string, string>;
		expect(headers['content-type']).toBe('application/x-www-form-urlencoded');
		expect(headers.accept).toBe('application/json');
	});

	it('regression: data.options.publicKey survives the round trip (the crash)', async () => {
		stubFetch({
			type: 'success',
			status: 200,
			location: '/settings/security',
			data: stringify({
				state: 's1',
				options: { publicKey: { challenge: 'abc', rp: { id: 'gofar.id' } } }
			})
		});

		const out = await submitAction<{
			state: string;
			options: { publicKey: { challenge: string; rp: { id: string } } };
		}>('passkeyRegisterBegin', { ready: '1' });

		if (out.kind !== 'data') throw new Error('expected data');
		expect(out.data.options.publicKey.challenge).toBe('abc');
		expect(out.data.options.publicKey.rp.id).toBe('gofar.id');
	});

	it('surfaces a redirect location (the cookie is already set server-side)', async () => {
		stubFetch({
			type: 'redirect',
			status: 303,
			location: '/setup?change=1'
		});

		const out = await submitAction<never>('passkeyFinish', { state: 's1', response: '{}' });

		expect(out).toEqual({ kind: 'redirect', location: '/setup?change=1' });
	});

	it('throws the DECODED fail() payload as ActionFailure (status + data)', async () => {
		stubFetch(
			{
				type: 'failure',
				status: 400,
				location: '/settings/security',
				data: stringify({ pk: { message: 'no such method' } })
			},
			400
		);

		const err = await submitAction('passkeyRegisterBegin', { ready: '1' }).catch((e) => e);

		expect(err).toBeInstanceOf(ActionFailure);
		expect(err.status).toBe(400);
		expect(err.data).toEqual({ pk: { message: 'no such method' } });
	});

	it('throws the envelope error message on an unexpected action throw', async () => {
		stubFetch(
			{
				type: 'error',
				location: '/login',
				error: { message: 'Internal Error' }
			},
			500
		);

		const err = await submitAction('passkeyBegin', { ready: '1' }).catch((e) => e);

		expect(err).toBeInstanceOf(ActionFailure);
		expect(err.message).toBe('Internal Error');
	});

	it('a 204 success (data absent) is undefined data, not a parse crash', async () => {
		stubFetch({ type: 'success', status: 204, location: '/settings/security' });

		const out = await submitAction<void>('passkeyDelete', { id: 'x' });

		expect(out.kind).toBe('data');
		if (out.kind === 'data') expect(out.data).toBeUndefined();
	});

	it('never returns a half-parsed answer (non-JSON is a failure)', async () => {
		stubUnparseable(502);

		const err = await submitAction('passkeyBegin').catch((e) => e);

		expect(err).toBeInstanceOf(ActionFailure);
		expect(err.status).toBe(502);
	});
});
