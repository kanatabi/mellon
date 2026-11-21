// The DatePicker contract (SHADCN-PLAN 4.4): ISO in → ISO out, the grid
// rides the block's calendar now. The old hand-built grid ran untested.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import DatePicker from './DatePicker.svelte';

describe('the DatePicker contract', () => {
	it('the trigger renders the wire value and opens the block calendar', async () => {
		const { getByRole } = render(DatePicker, {
			props: { value: '2026-11-21', onchange: () => {} }
		});
		const trigger = getByRole('button', { name: 'Choose publish date' });
		expect(trigger.textContent).toContain('2026-11-21');
		trigger.click();
		await tick();
		const grid = document.body.querySelector('[data-calendar-root]');
		expect(grid, 'the block calendar opens in the popover').toBeTruthy();
	});

	it('picking a day hands the ISO string to the caller', async () => {
		const onchange = vi.fn();
		const { getByRole } = render(DatePicker, {
			props: { value: '2026-11-21', onchange }
		});
		getByRole('button', { name: 'Choose publish date' }).click();
		await tick();
		// the day cell for the 15th (the grid renders divs, not buttons —
		// bits-ui's day is [data-bits-day] inside the cell)
		const day = document.body.querySelector(
			'[data-calendar-cell][data-value="2026-11-15"] [data-bits-day]'
		);
		expect(day, 'a day cell').toBeTruthy();
		(day as HTMLElement).click();
		await tick();
		expect(onchange).toHaveBeenCalledWith('2026-11-15');
	});
});
