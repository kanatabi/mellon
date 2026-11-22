// The photo-detail page MOUNTS — the v4.0.0 production 500 was a hydration
// throw (`bind:ref={undefined}` against Button's `ref = $bindable(null)`),
// invisible to every gate: SSR never runs bindings, build doesn't execute,
// and no test constructed the page. A route-mount smoke is the layer that
// catches this class. (users-page.dom.test.ts is the pattern.)
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './photo-page-fixture.svelte';

describe('the photo page mounts (the hydration-500 round)', () => {
	it('renders the preview canvas without throwing', () => {
		const { getByRole } = render(Fixture);
		expect(getByRole('img')).toBeTruthy(); // the darkroom canvas
	});
});

describe('the photo page — the EXIF block (Round B)', () => {
	it('shows the honest empty state when no EXIF was captured', () => {
		const { getByText } = render(Fixture);
		// the resolution echoes in the block's header — present in BOTH states
		expect(getByText('exif · 4×3')).toBeTruthy();
		expect(getByText('no EXIF — uploaded before capture')).toBeTruthy();
	});

	it('renders the curated rows when a capture exists', () => {
		const { getByText } = render(Fixture, {
			props: {
				exif: {
					takenAt: '2024-04-01T05:39:00Z',
					camera: 'Fujifilm X100VI',
					lens: '23mm f2',
					shutter: '1/250',
					iso: 640,
					aperture: 2.8
				}
			}
		});
		expect(getByText('camera')).toBeTruthy();
		expect(getByText('Fujifilm X100VI')).toBeTruthy();
		expect(getByText('f/2.8')).toBeTruthy();
		expect(getByText('1/250')).toBeTruthy();
	});
});
