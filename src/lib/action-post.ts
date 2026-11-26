/**
 * The action-post seam — ONE place that knows what `fetch('?/name')` answers.
 *
 * Kit v3 form actions are reachable from a plain fetch, but the response is
 * NOT the action's return value, and it is encoded TWICE:
 *
 *   1. a JSON ENVELOPE — `{type:'success', status, location, data}` (or
 *      `'redirect'` / `'failure'` / `'error'`), and
 *   2. `data` is a **devalue STRING**, not an object — Kit's
 *      `action_result_json` runs `try_serialize(result.data, stringify)`,
 *      and the client half is `deserialize` (`$app/forms`): JSON.parse,
 *      then `parse` the payload.
 *
 * Both layers cost a debugging round. Reading `begin.options` off the
 * envelope threw `can't access property "publicKey", r is undefined`; then
 * returning the still-stringified payload threw the same error one level
 * later. This seam exists so no page has to remember either shape.
 *
 * Two more wire rules live here, both paid for:
 *   - FORM content type only (Kit 415s `application/json` before the action
 *     runs) — the ceremony payloads ride urlencoded fields, JSON stringified
 *     inside its field.
 *   - `accept: application/json` selects Kit's action-JSON branch; a
 *     wildcard Accept happens to negotiate the same, but say what we mean.
 *
 * NOTE: this app has NO custom `transport` hook (no encode/decode pairs in
 * hooks), so devalue's `stringify`/`parse` are exactly what Kit uses. If a
 * transport ever lands, switch `parse` for `deserialize` from `$app/forms`
 * (same call, plus the app's decoders).
 */
import { parse } from 'devalue';

/** A `fail(status, data)` envelope, surfaced as a throwable. */
export class ActionFailure extends Error {
	readonly status: number;
	/** The action's fail() payload, DECODED (pages read their own key). */
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

type Envelope =
	| { type: 'success'; status: number; location: string; data: string }
	| { type: 'redirect'; status: number; location: string }
	| { type: 'failure'; status: number; location: string; data: string }
	| { type: 'error'; location: string; error?: { message?: string } };

/**
 * POST a named form action and unwrap Kit's envelope AND its devalue payload.
 *
 * Success -> `{kind:'data', data}`; `redirect()` in the action ->
 * `{kind:'redirect', location}` (the response already carries the Set-Cookie
 * headers — Kit's action_json_redirect runs add_cookies_to_headers, so a
 * login that mints a session is safe to follow from JS). A `fail()` throws
 * `ActionFailure` carrying the DECODED payload; an unexpected throw (the
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
	const text = await res.text();
	let body: Envelope | null = null;
	try {
		body = JSON.parse(text) as Envelope;
	} catch {
		/* a proxy page or an empty body — reported below as "no answer" */
	}
	if (!body) {
		throw new ActionFailure(res.status, null, `action ${name}: the server sent no answer`);
	}
	if (body.type === 'redirect') return { kind: 'redirect', location: body.location };
	if (body.type === 'success') return { kind: 'data', data: decode<T>(body.data) };
	if (body.type === 'failure') {
		throw new ActionFailure(body.status, decode(body.data), `action ${name} failed`);
	}
	throw new ActionFailure(
		res.status,
		null,
		body.error?.message || `action ${name}: the server failed`
	);
}

/** Second layer: Kit's payload is devalue-encoded (a JSON string). */
function decode<T>(data: unknown): T {
	return (typeof data === 'string' ? parse(data) : data) as T;
}
