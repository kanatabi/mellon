// End-to-end: the dialog's Role select must be PICKABLE. The portaled
// popup's option click has to survive the dialog's dismiss/focus machinery
// (the Admin-role round). Drives the real users page fixture.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import Fixture from './users-page-fixture.svelte';

async function openDialogAndSelect() {
	const { getByRole } = render(Fixture);
	getByRole('button', { name: 'Create New User' }).click();
	await tick();
	getByRole('button', { name: 'Role' }).click();
	await tick();
	const listbox = document.querySelector('[role="listbox"]');
	expect(listbox, 'the portaled listbox').toBeTruthy();
	return { getByRole, listbox: listbox as HTMLElement };
}

describe('the Role select inside the dialog is pickable', () => {
	it('clicking an option changes the value AND keeps the dialog open', async () => {
		const { getByRole, listbox } = await openDialogAndSelect();
		const admin = [...listbox.querySelectorAll('button')].find((b) =>
			b.textContent?.includes('admin')
		);
		expect(admin, 'the admin option').toBeTruthy();
		(admin as HTMLElement).click();
		await tick();
		// the trigger's label reads the new value…
		expect(getByRole('button', { name: 'Role' }).textContent).toContain('admin');
		// …and the dialog is STILL open (the dismiss layer did not eat it)
		expect(getByRole('dialog')).toBeTruthy();
	});
});
