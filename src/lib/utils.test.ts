import { describe, expect, it } from 'vitest';
import { cn } from './utils.ts';

describe('cn', () => {
	it('resolves conflicting utilities last-wins', () => {
		expect(cn('px-2', 'px-4')).toBe('px-4');
	});

	it('merges mellon brand/muted tokens as ordinary utilities', () => {
		expect(cn('bg-brand', 'bg-muted')).toBe('bg-muted');
	});

	it('keeps non-conflicting utilities in order', () => {
		expect(cn('flex items-center', 'gap-2')).toBe('flex items-center gap-2');
	});

	it('drops falsy inputs', () => {
		expect(cn('p-2', false, undefined, null, '')).toBe('p-2');
	});

	it('accepts arrays and objects like clsx', () => {
		expect(cn(['p-2', 'p-4'], { hidden: false, block: true })).toBe('p-4 block');
	});

	it('lets a caller override a default set', () => {
		const base = 'rounded-lg border border-border px-3 py-2';
		expect(cn(base, 'py-1')).toBe('rounded-lg border border-border px-3 py-1');
	});
});
