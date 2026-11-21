// End-to-end: the dialog's Role select must be PICKABLE. The portaled
// popup's option click has to survive the dialog's dismiss/focus machinery
// (the Admin-role round). Drives the real users page fixture.
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './users-page-fixture.svelte';

async function openDialogAndSelect() {
	const { getByRole } = render(Fixture);
	getByRole('button', { name: 'Create New User' }).click();
	await tick();
	// the bits-ui Select.Trigger is a combobox, not a button role
	const roleTrigger = document.querySelector('[data-slot="select-trigger"]');
	expect(roleTrigger, 'the role select trigger').toBeTruthy();
	(roleTrigger as HTMLElement).click();
	await tick();
	const listbox = document.querySelector('[role="listbox"]');
	expect(listbox, 'the select listbox').toBeTruthy();
	return { getByRole, listbox: listbox as HTMLElement };
}

describe('the Role select inside the dialog is pickable', () => {
	it('clicking an option changes the value AND keeps the dialog open', async () => {
		const { getByRole, listbox } = await openDialogAndSelect();
		// bits-ui items are role=option divs with direct (non-delegated) listeners
		const admin = [...listbox.querySelectorAll('[role="option"]')].find((o) =>
			o.textContent?.includes('admin')
		);
		expect(admin, 'the admin option').toBeTruthy();
		// bits-ui selects on the POINTER PAIR (down records the press, up
		// commits) — a synthetic .click() dispatches neither
		fireEvent.pointerDown(admin as HTMLElement);
		fireEvent.pointerUp(admin as HTMLElement);
		await tick();
		// the trigger's label reads the new value…
		expect(
			(document.querySelector('[data-slot="select-trigger"]') as HTMLElement).textContent
		).toContain('admin');
		// …and the dialog is STILL open (the dismiss layer did not eat it)
		expect(getByRole('dialog')).toBeTruthy();
	});
});
