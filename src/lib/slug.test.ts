import { describe, expect, it } from 'vitest';
import { slugify } from './slug.ts';

describe('slugify', () => {
	it('normalizes titles to hyphen slugs', () => {
		expect(slugify('The Shape of a Useful Queue')).toBe('the-shape-of-a-useful-queue');
	});

	it('strips accents, punctuation and edges', () => {
		expect(slugify('  Café — déjà vu!!  ')).toBe('cafe-deja-vu');
	});

	it('collapses to empty for no alnum content', () => {
		expect(slugify('!!!')).toBe('');
	});
});
