// Pins the S2 hydration trap (observed live 2026-11-20): binding an
// undefined-initialized $state into a `$bindable(null)` prop throws
// `props_invalid_value` — and because the throw landed inside the
// error-boundary render, the client router fell back to the ROOT boundary
// and the 500 page lost the shell. The fix lives in the shell (`burger`
// initializes null); these fixtures pin both sides of the contract.
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Broken from './trigger-ref-undefined.svelte';
import Fixed from './trigger-ref-null.svelte';

describe('bind:ref into a $bindable with a fallback', () => {
	it('an undefined-initialized binding throws props_invalid_value', () => {
		expect(() => render(Broken)).toThrow(/props_invalid_value|fallback value/);
	});

	it('a null-initialized binding mounts and delivers the element', () => {
		const { getByRole } = render(Fixed);
		expect(getByRole('button')).toBeTruthy();
	});
});
