import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionFailure, submitAction } from './action-post.ts';

/**
 * The action envelope is the wire contract (Kit v3): a plain `fetch('?/name')`
 * answers `{type, status, location, data}` — never the action's return value.
 * The passkey round read it one level too high on BOTH pages; this battery is
 * the guard so the next action fetch can't relearn it by crashing.
 */

type Call = { url: string; init: RequestInit };

function stubFetch(payload: unknown, status = 200): Call[] {
	const calls: Call[] = [];
	const fn = vi.fn(async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return {
			ok: status < 400,
			status,
			json: async () => payload
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
			json: async () => {
				throw new Error('not json');
			}
		}))
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('submitAction', () => {
	it('posts the named action form-encoded and returns the payload inside data', async () => {
		const calls = stubFetch({
			type: 'success',
			status: 200,
			location: '/settings/security',
			data: { state: 's1', options: { publicKey: { challenge: 'c' } } }
		});

		const out = await submitAction<{ state: string; options: unknown }>('passkeyRegisterBegin', {
			ready: '1'
		});

		expect(out).toEqual({
			kind: 'data',
			data: { state: 's1', options: { publicKey: { challenge: 'c' } } }
		});
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('?/passkeyRegisterBegin');
		expect(calls[0].init.method).toBe('POST');
		expect(calls[0].init.body?.toString()).toBe('ready=1');
		const headers = calls[0].init.headers as Record<string, string>;
		expect(headers['content-type']).toBe('application/x-www-form-urlencoded');
		expect(headers.accept).toBe('application/json');
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

	it('throws the fail() payload as ActionFailure (status + data)', async () => {
		stubFetch(
			{
				type: 'failure',
				status: 400,
				location: '/settings/security',
				data: { pk: { message: 'no such method' } }
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

	it('never returns a half-parsed answer (non-JSON is a failure)', async () => {
		stubUnparseable(502);

		const err = await submitAction('passkeyBegin').catch((e) => e);

		expect(err).toBeInstanceOf(ActionFailure);
		expect(err.status).toBe(502);
	});
});
