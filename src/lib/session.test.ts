import { describe, expect, it } from 'vitest';

import { cookieTrust, SESSION_COOKIE } from '#lib/session.ts';

describe('cookieTrust — secure follows the REAL transport', () => {
	it('https origin keeps Secure (the public console posture)', () => {
		expect(cookieTrust(new URL('https://console.gofar.id/login')).secure).toBe(true);
	});
	it('plain-http origin drops Secure so browsers actually store it', () => {
		// the local-cluster rehearsal case: browsers REFUSE a Secure cookie
		// over http on a hostname — login silently loops if we hardcode true
		expect(cookieTrust(new URL('http://console.gofar.id:30080/login')).secure).toBe(false);
	});
	it('cookie name is the documented contract', () => {
		expect(SESSION_COOKIE).toBe('mellon_session');
	});
});
