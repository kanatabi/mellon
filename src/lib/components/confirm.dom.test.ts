// The house confirm (D15) — the native confirm()'s replacement. Pins the
// choice flow + the destructive verb's fill.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import Confirm from './Confirm.svelte';

describe('the house confirm', () => {
	it('Confirm fires onConfirm, Cancel fires onClose — neither double-fires', async () => {
		const onConfirm = vi.fn();
		const onClose = vi.fn();
		const { getByRole, rerender } = render(Confirm, {
			props: {
				heading: 'Drop NEW_KEY_2 from this secret?',
				onConfirm,
				onClose
			}
		});
		const dialog = getByRole('alertdialog');
		expect(dialog.textContent).toContain('Drop NEW_KEY_2 from this secret?');

		// Cancel: close, no confirm
		getByRole('button', { name: 'Cancel' }).click();
		await tick();
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onConfirm).not.toHaveBeenCalled();

		// Confirm: the verb, not the close
		await rerender({ heading: 'h', onConfirm, onClose });
		getByRole('button', { name: 'Confirm' }).click();
		await tick();
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it('the destructive verb fills with danger, not the violet', async () => {
		const { getByRole } = render(Confirm, {
			props: {
				heading: 'h',
				confirmLabel: 'Drop key',
				destructive: true,
				onConfirm: () => {},
				onClose: () => {}
			}
		});
		expect(getByRole('button', { name: 'Drop key' }).className).toContain('bg-danger');
		expect(getByRole('button', { name: 'Drop key' }).className).not.toContain('bg-brand');
	});
});
