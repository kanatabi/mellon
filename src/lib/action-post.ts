/**
 * The action-post seam — ONE place that knows what `fetch('?/name')` answers.
 *
 * Kit v3 form actions are reachable from a plain fetch, but the response is
 * NOT the action's return value: it is the action ENVELOPE
 * (`{type:'success', status, location, data}` / `'redirect'` / `'failure'` /
 * `'error'`). Reading `begin.options` off the envelope is how the passkey
 * round crashed with `can't access property "publicKey", r is undefined`
 * (`begin.options` was undefined one level above the payload), and why the
 * login finish read `out.mustChange` off a redirect envelope. This seam
 * exists so no page has to remember the shape a second time.
 *
 * Two wire rules live here, both paid for:
 *   - FORM content type only (Kit 415s `application/json` before the action
 *     runs) — the ceremony payloads ride urlencoded fields, JSON stringified
 *     inside its field.
 *   - `accept: application/json` selects Kit's action-JSON branch; a
 *     wildcard Accept happens to negotiate the same, but say what we mean.
 */

/** A `fail(status, data)` envelope, surfaced as a throwable. */
export class ActionFailure extends Error {
	readonly status: number;
	/** The action's fail() payload, verbatim (pages read their own key). */
	readonly data: unknown;

	constructor(status: number, data: unknown, message: string) {
		super(message);
		this.name = 'ActionFailure';
		this.status = status;
		this.data = data;
	}
}

/** The two shapes an action fetch can resolve to (both mean "the action ran"). */
export type ActionOutcome<T> = { kind: 'data'; data: T } | { kind: 'redirect'; location: string };

type Envelope<T> =
	| { type: 'success'; status: number; location: string; data: T }
	| { type: 'redirect'; status: number; location: string }
	| { type: 'failure'; status: number; location: string; data: unknown }
	| { type: 'error'; location: string; error?: { message?: string } };

/**
 * POST a named form action and unwrap Kit's envelope.
 *
 * Success -> `{kind:'data', data}`; `redirect()` in the action ->
 * `{kind:'redirect', location}` (the response already carries the Set-Cookie
 * headers — Kit's action_json_redirect runs add_cookies_to_headers, so a
 * login that mints a session is safe to follow from JS). A `fail()` throws
 * `ActionFailure` carrying the action's payload; an unexpected throw (the
 * `error` envelope) throws too, with the server's message when it has one.
 */
export async function submitAction<T>(
	name: string,
	fields: Record<string, string> = {}
): Promise<ActionOutcome<T>> {
	const res = await fetch(`?/${name}`, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams(fields)
	});
	const body = (await res.json().catch(() => null)) as Envelope<T> | null;
	if (!body) {
		throw new ActionFailure(res.status, null, `action ${name}: the server sent no answer`);
	}
	if (body.type === 'redirect') return { kind: 'redirect', location: body.location };
	if (body.type === 'success') return { kind: 'data', data: body.data };
	if (body.type === 'failure') {
		throw new ActionFailure(body.status, body.data, `action ${name} failed`);
	}
	throw new ActionFailure(
		res.status,
		null,
		body.error?.message || `action ${name}: the server failed`
	);
}
