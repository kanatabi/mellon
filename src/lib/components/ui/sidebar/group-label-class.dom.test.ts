// Pins the Svelte 5 class-clobber discovered in the S2 round (observed live:
// the collapsed rail's section labels rendered sentence-case and never
// faded, because a static `class` after `{...props}` REPLACES the spread's
// class). The composition pattern — cn(props.class, …) — must keep both.
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Composed from './group-label-compose.svelte';

describe('child-snippet class composition', () => {
	it('cn(props.class, …) keeps BOTH the vendored classes and the caller’s', () => {
		const { getByRole } = render(Composed);
		const cls = getByRole('button').className;
		expect(cls).toContain('wanted-from-props');
		expect(cls).toContain('added-by-caller');
	});
});
