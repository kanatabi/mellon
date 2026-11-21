// Proves the DOM project is wired before any component depends on it (S1/R7).
// If this file fails, every later `ui/` component test is untrustworthy.
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Button from './components/ui/button/button.svelte';

describe('DOM harness', () => {
	it('mounts a vendored component into a real document', () => {
		render(Button, { children: undefined as never });
		expect(screen.getByRole('button')).toBeTruthy();
	});

	it('delivers a click through Svelte 5 props', () => {
		const onclick = vi.fn();
		render(Button, { onclick });
		fireEvent.click(screen.getByRole('button'));
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it('the action fill resolves at runtime (R3: a token without a --color-* twin is silent)', () => {
		// The default variant is the ACTION FILL by doctrine (SHADCN.md §3.1:
		// --primary is the verb). S3's cast renamed the default to `primary`
		// with the pill grammar — bg-brand — which is the same fill through the
		// alias chain (--primary: var(--brand)). Still the one runtime proof
		// that the alias chain produces a utility at all — the @theme check in
		// palette.test.ts is text-level and cannot see Tailwind's output.
		render(Button, {});
		expect(screen.getByRole('button').className).toContain('bg-brand');
	});

	it('lets a caller override the default classes', () => {
		render(Button, { class: 'px-9' });
		expect(screen.getByRole('button').className).toContain('px-9');
	});
});
