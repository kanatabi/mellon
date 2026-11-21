// The users page's 500 was a RENDER crash: the header's Dialog.Trigger sat
// OUTSIDE its Dialog.Root's context (the Root opened further down the page)
// — the data endpoint answered 200 while the page died (the console error:
// Context "Dialog.Root | AlertDialog.Root" not found, at Dialog_trigger).
// This render smoke pins the containment behaviorally: the page renders,
// and clicking the door OPENS the dialog — the context wiring is live.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './users-page-fixture.svelte';

describe('the users page renders (the 500-on-a-200 round)', () => {
	it('renders the header door + the table without throwing', () => {
		const { getByRole } = render(Fixture);
		expect(getByRole('button', { name: 'Create New User' })).toBeTruthy();
		expect(getByRole('table')).toBeTruthy();
	});

	it('the door OPENS the dialog (the Root wraps the whole section)', async () => {
		const { getByRole } = render(Fixture);
		getByRole('button', { name: 'Create New User' }).click();
		await tick();
		// the dialog content mounts with the username field focused inside it
		expect(getByRole('dialog')).toBeTruthy();
		expect(getByRole('textbox')).toBeTruthy();
	});
});
