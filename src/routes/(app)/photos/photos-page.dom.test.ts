// The photos list page MOUNTS — the v4.0.0 production 500 was a hydration
// throw (`bind:ref={undefined}` against Button's `ref = $bindable(null)`),
// invisible to every gate: SSR never runs bindings, build doesn't execute,
// and no test constructed the page. A route-mount smoke is the layer that
// catches this class. (users-page.dom.test.ts is the pattern.)
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './photos-page-fixture.svelte';

describe('the photos page mounts (the hydration-500 round)', () => {
	it('renders the darkroom without throwing', () => {
		const { getByRole } = render(Fixture);
		expect(getByRole('heading', { name: 'Photos' })).toBeTruthy();
		expect(getByRole('textbox')).toBeTruthy(); // the search field
	});
});
