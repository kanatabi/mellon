/**
 * The browser WebAuthn helper — the passkey round's client half (C1).
 * The private key NEVER leaves the authenticator (Bitwarden/iCloud/a
 * key); this file only encodes base64url ↔ ArrayBuffers and speaks to
 * `navigator.credentials`. The server side is lumen's method machine —
 * the options come FROM lumen, the responses go BACK TO lumen; this
 * file owns nothing but the codec and the two ceremony calls.
 *
 * The serialized shapes mirror the browser's PublicKeyCredential JSON
 * exactly (the wire lumen's library parses verbatim).
 */

function b64uToBytes(s: string): Uint8Array<ArrayBuffer> {
	const padded = s.replace(/-/g, '+').replace(/_/g, '/');
	const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
	const bin = atob(padded + pad);
	const out = new Uint8Array(new ArrayBuffer(bin.length));
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function bytesToB64u(data: ArrayBuffer | Uint8Array): string {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The serialized assertion — exactly the JSON lumen's parser expects. */
export interface SerializedAssertion {
	id: string;
	rawId: string;
	type: string;
	response: {
		authenticatorData: string;
		clientDataJSON: string;
		signature: string;
		userHandle: string | null;
	};
}

/** The assertion options as lumen JSON-serializes them (base64url strings). */
export interface SerializedRequestOptions {
	publicKey: {
		challenge: string;
		rpId?: string;
		timeout?: number;
		userVerification?: string;
		allowCredentials?: { id: string; transports?: string[] }[];
	};
}

/** The creation options as lumen JSON-serializes them (same base64url). */
export interface SerializedCreationOptions {
	publicKey: {
		challenge: string;
		rp: { id?: string; name: string };
		user: { id: string; name: string; displayName: string };
		pubKeyCredParams?: { alg: number; type: string }[];
		excludeCredentials?: { id: string; transports?: string[] }[];
		authenticatorSelection?: Record<string, unknown>;
		timeout?: number;
		attestation?: string;
	};
}

/** The serialized attestation (registration) — same honesty. */
export interface SerializedAttestation {
	id: string;
	rawId: string;
	type: string;
	response: {
		attestationObject: string;
		clientDataJSON: string;
		transports?: string[];
	};
}

/** webauthn.login's browser half: the options FROM lumen, the assertion
 *  BACK to lumen. `userHandle` may be null (discoverable login). */
export async function webauthnGet(options: SerializedRequestOptions): Promise<SerializedAssertion> {
	const opts = options;
	const assertion = (await navigator.credentials.get({
		publicKey: {
			challenge: b64uToBytes(opts.publicKey.challenge),
			rpId: opts.publicKey.rpId,
			timeout: opts.publicKey.timeout ?? 60_000,
			userVerification: (opts.publicKey.userVerification ??
				'preferred') as UserVerificationRequirement
		},
		mediation: 'optional'
	})) as PublicKeyCredential & { response: AuthenticatorAssertionResponse };
	if (!assertion) throw new Error('passkey ceremony cancelled');
	return {
		id: assertion.id,
		rawId: bytesToB64u(assertion.rawId),
		type: assertion.type,
		response: {
			authenticatorData: bytesToB64u(assertion.response.authenticatorData),
			clientDataJSON: bytesToB64u(assertion.response.clientDataJSON),
			signature: bytesToB64u(assertion.response.signature),
			userHandle: assertion.response.userHandle ? bytesToB64u(assertion.response.userHandle) : null
		}
	};
}

/** webauthn.register's browser half: the creation options FROM lumen,
 *  the attestation BACK to lumen. */
export async function webauthnCreate(
	options: SerializedCreationOptions
): Promise<SerializedAttestation> {
	const opts = options;
	const creation = (await navigator.credentials.create({
		publicKey: {
			challenge: b64uToBytes(opts.publicKey.challenge),
			rp: opts.publicKey.rp,
			user: {
				id: b64uToBytes(opts.publicKey.user.id),
				name: opts.publicKey.user.name,
				displayName: opts.publicKey.user.displayName
			},
			pubKeyCredParams: (opts.publicKey.pubKeyCredParams ?? [
				{ alg: -7, type: 'public-key' },
				{ alg: -257, type: 'public-key' }
			]) as PublicKeyCredentialParameters[],
			excludeCredentials: opts.publicKey.excludeCredentials?.map((c) => ({
				id: b64uToBytes(c.id),
				transports: c.transports as AuthenticatorTransport[]
			})) as unknown as PublicKeyCredentialDescriptor[],
			authenticatorSelection: opts.publicKey
				.authenticatorSelection as AuthenticatorSelectionCriteria,
			timeout: opts.publicKey.timeout ?? 60_000,
			attestation: (opts.publicKey.attestation ?? 'none') as AttestationConveyancePreference
		}
	})) as PublicKeyCredential & { response: AuthenticatorAttestationResponse };
	if (!creation) throw new Error('passkey ceremony cancelled');
	return {
		id: creation.id,
		rawId: bytesToB64u(creation.rawId),
		type: creation.type,
		response: {
			attestationObject: bytesToB64u(creation.response.attestationObject),
			clientDataJSON: bytesToB64u(creation.response.clientDataJSON),
			transports: creation.response.getTransports?.() ?? []
		}
	};
}
