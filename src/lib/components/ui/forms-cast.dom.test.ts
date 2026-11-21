// The S3 cast: the button variant map is MELLON's (pill primary, mono chip
// quiet, danger pill, soft text-ghost) with the registry names kept alive for
// the vendored overlays (dialog X, sheet close, sidebar trigger). Pins the
// anatomy the sweep relies on — SHADCN-PLAN 3.1.
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Button from '#lib/components/ui/button/button.svelte';
import Input from '#lib/components/ui/input/input.svelte';
import Label from '#lib/components/ui/label/label.svelte';
import Textarea from '#lib/components/ui/textarea/textarea.svelte';

describe('the button cast', () => {
	it('primary is the violet pill — the one verb', () => {
		const { getByRole } = render(Button, {
			props: { variant: 'primary', children: undefined as never }
		});
		const b = getByRole('button');
		expect(b.className).toContain('rounded-full');
		expect(b.className).toContain('bg-brand');
		expect(b.className).not.toContain('rounded-lg');
		// pills are padding-sized — and the VARIANT must beat the default
		// size's h-8 (tv emits size before variant: the ordering regression)
		expect(b.className).not.toContain('h-8');
	});

	it('quiet is the mono PICKER chip — a real surface (D14)', () => {
		const { getByRole } = render(Button, {
			props: { variant: 'quiet', children: undefined as never }
		});
		const b = getByRole('button');
		expect(b.className).toContain('font-mono');
		expect(b.className).toContain('text-xs');
		expect(b.className).toContain('text-muted-foreground');
		// the owner's "I don't like this kind of button": the chip carries the
		// select-trigger's anatomy — a card surface + the border — so a
		// secondary action reads as a control, not as bare text
		expect(b.className).toContain('bg-card');
		expect(b.className).toContain('border-border');
		expect(b.className).not.toContain('bg-transparent');
		// the ordering pin: the variant's pill padding wins over the default
		// size's h-8/px-2.5 (tv definition order: size before variant)
		expect(b.className).toContain('px-3');
		expect(b.className).toContain('py-1.5');
		expect(b.className).not.toContain('h-8');
		expect(b.className).not.toContain('px-2.5');
	});

	it('ghost stays the registry look — the overlays did not move', () => {
		const { getByRole } = render(Button, {
			props: { variant: 'ghost', size: 'icon-sm', children: undefined as never }
		});
		const b = getByRole('button');
		expect(b.className).toContain('hover:bg-muted'); // the S2 hover wash
		expect(b.className).toContain('size-7');
		expect(b.className).not.toContain('rounded-full');
	});
});

describe('the house field lines', () => {
	it('input renders the verbatim 10× line', () => {
		const { getByRole } = render(Input);
		const input = getByRole('textbox');
		expect(input.className).toContain('bg-card');
		expect(input.className).toContain('font-mono');
		expect(input.className).toContain('focus-visible:border-brand');
		expect(input.className).not.toContain('w-full'); // call-site decision
		expect(input.className).toContain('aria-invalid:border-danger');
	});

	it('textarea renders the verbatim photos line', () => {
		const { getByRole } = render(Textarea);
		const ta = getByRole('textbox');
		expect(ta.className).toContain('resize-y');
		expect(ta.className).toContain('bg-transparent');
		expect(ta.className).toContain('focus-visible:border-brand');
	});

	it('the registry default is untouched (overlays)', () => {
		const { getByRole } = render(Button, { props: { children: undefined as never } });
		const b = getByRole('button');
		expect(b.className).toContain('bg-primary'); // the §3.1 action fill
		expect(b.className).toContain('h-8');
	});

	it('label mono is the metadata anatomy', () => {
		const { container } = render(Label, { props: { mono: true, children: undefined as never } });
		const l = container.querySelector('[data-slot="label"]') as HTMLLabelElement;
		expect(l.className).toContain('tracking-widest');
		expect(l.className).toContain('uppercase');
		expect(l.className).toContain('text-muted-foreground');
	});
});
