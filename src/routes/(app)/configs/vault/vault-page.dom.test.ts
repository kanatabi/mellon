// The vault page's RESTORE contract (the restore-snapshot round): a restore
// REPLACES the form with the target version exactly — keys and values —
// the overlay semantics could never recover mirror-dropped keys (a v2
// sharing no keys with the current shape overlaid NOTHING). Drives the real
// history drawer over a stubbed /api surface. NOTE: value inputs render as
// type=password while masked — role queries don't see them; label queries do.
import { render, fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fixture from './vault-page-fixture.svelte';

const HEAD = {
	data: { ADMIN_URL: 'http://lumen-admin.lumen.svc.cluster.local', 'Hello World': 'Test' },
	createdTime: '2026-11-21T09:00:00Z',
	version: 5,
	destroyed: false,
	deletionTime: null
};
const V2 = {
	data: {
		API_BASE: 'http://lumen-http-server-staging.lumen.svc.cluster.local',
		CMS_URL: 'http://lumen-http-server-staging.lumen.svc.cluster.local'
	},
	createdTime: '2026-11-14T10:00:00Z',
	version: 2,
	destroyed: false,
	deletionTime: null
};

function stubFetch() {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: RequestInfo | URL) => {
			const url = String(_url);
			const body = url.includes('?meta')
				? {
						currentVersion: 5,
						versions: [
							{ version: 5, createdTime: HEAD.createdTime, destroyed: false },
							{ version: 2, createdTime: V2.createdTime, destroyed: false }
						],
						pinnedVersion: null
					}
				: url.includes('version=2')
					? V2
					: HEAD;
			return new Response(JSON.stringify(body), {
				headers: { 'content-type': 'application/json' }
			});
		})
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe('the vault page — restore replaces the form with the version exactly', () => {
	it('a clean restore swaps every key/value and names the shape delta', async () => {
		stubFetch();
		const { getByRole, getByText, getByLabelText } = render(Fixture);

		// open the history drawer (the meta fetch feeds the version rows)
		await fireEvent.click(getByRole('button', { name: 'History' }));
		await vi.waitFor(() => expect(getByRole('button', { name: 'Restore v2' })).toBeTruthy());

		await fireEvent.click(getByRole('button', { name: 'Restore v2' }));

		// the form now holds EXACTLY v2: the mirror-dropped keys are back with
		// their values, and the head-only keys are GONE from the table
		await vi.waitFor(() => expect(getByLabelText('key API_BASE')).toBeTruthy());
		expect(getByLabelText('key CMS_URL')).toBeTruthy();
		expect(() => getByLabelText('key ADMIN_URL')).toThrow();
		expect(() => getByLabelText(/^key Hello World$/)).toThrow();
		// the banner names the shape delta + the promotion path
		expect(
			getByText(
				/form replaced with v2 \(\+API_BASE, \+CMS_URL -ADMIN_URL, -Hello World\) — save to promote/
			)
		).toBeTruthy();
	});

	it('a DIRTY draft asks before the replacement discards it', async () => {
		stubFetch();
		const { getByRole, getByText, getByLabelText } = render(Fixture);
		// make the form dirty first: type into a value through its label
		await fireEvent.input(getByLabelText('value of ADMIN_URL'), {
			target: { value: 'half-typed change' }
		});

		await fireEvent.click(getByRole('button', { name: 'History' }));
		await vi.waitFor(() => expect(getByRole('button', { name: 'Restore v2' })).toBeTruthy());
		await fireEvent.click(getByRole('button', { name: 'Restore v2' }));

		// the house confirm stands in front of the replacement
		await vi.waitFor(() => expect(getByText('Replace the current edit with v2?')).toBeTruthy());
		await fireEvent.click(getByRole('button', { name: 'Replace' }));
		await vi.waitFor(() => expect(getByText(/form replaced with v2/)).toBeTruthy());
	});
});
