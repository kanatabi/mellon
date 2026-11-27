// The closed select value must not wrap: a long project name (e.g.
// "Testing Project · completed") is a single-line ellipsized label, so the
// trigger keeps the same height as the field beside it (2026-11-27).
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './select-fixture.svelte';

describe('the select trigger label', () => {
	it('pins the value as a truncating, shrinkable span', () => {
		const { container } = render(Fixture);
		const trigger = container.querySelector('[data-slot="select-trigger"]');
		expect(trigger).toBeTruthy();
		expect(trigger?.className).toContain('min-w-0');
		// the arbitrary variant that targets bits-ui's value span
		expect(trigger?.className).toContain('[&>[data-slot=select-value]]:truncate');

		const value = trigger?.querySelector('[data-slot="select-value"]');
		expect(value?.textContent).toContain('Testing Project · completed');
	});
});
