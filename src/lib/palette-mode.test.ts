import { describe, expect, it } from 'vitest';
import { acceptsGroup, armMode, usesApi } from './palette-mode.ts';

describe('palette mode grammar', () => {
	it('prefix + space at position 0 arms the mode and consumes both characters', () => {
		expect(armMode('> save')).toEqual({ mode: 'commands', arg: 'save' });
		expect(armMode('/ alpine')).toEqual({ mode: 'content', arg: 'alpine' });
		expect(armMode('# photos')).toEqual({ mode: 'pages', arg: 'photos' });
	});

	it('an empty argument still arms — the mode IS the ask until you type', () => {
		expect(armMode('> ')).toEqual({ mode: 'commands', arg: '' });
	});

	it('a bare sigil without the committing space stays a literal query', () => {
		expect(armMode('>')).toBeNull();
		expect(armMode('/')).toBeNull();
		expect(armMode('#')).toBeNull();
	});

	it('sigils only arm at position 0, and only with the space', () => {
		expect(armMode('C++ > foo')).toBeNull();
		expect(armMode('#posts')).toBeNull();
		expect(armMode('>> save')).toBeNull();
		expect(armMode('')).toBeNull();
	});

	it('pasted prefix+argument commits in one keystroke', () => {
		expect(armMode('/ alpine ridge')).toEqual({ mode: 'content', arg: 'alpine ridge' });
	});

	it('modes route groups: commands=actions, content=posts/photos/tags, pages=nav+recents', () => {
		expect(acceptsGroup('all', 'photos')).toBe(true);
		expect(acceptsGroup('commands', 'actions')).toBe(true);
		expect(acceptsGroup('commands', 'go to')).toBe(false);
		expect(acceptsGroup('commands', 'posts')).toBe(false);
		expect(acceptsGroup('content', 'posts')).toBe(true);
		expect(acceptsGroup('content', 'photos')).toBe(true);
		expect(acceptsGroup('content', 'tags')).toBe(true);
		expect(acceptsGroup('content', 'actions')).toBe(false);
		expect(acceptsGroup('pages', 'go to')).toBe(true);
		expect(acceptsGroup('pages', 'open recent')).toBe(true);
		expect(acceptsGroup('pages', 'actions')).toBe(false);
	});

	it('only unmoded and / content ask the API', () => {
		expect(usesApi('all')).toBe(true);
		expect(usesApi('content')).toBe(true);
		// commands and pages are portal-side routing — the search door stays
		// reserved for content (§7 doctrine)
		expect(usesApi('commands')).toBe(false);
		expect(usesApi('pages')).toBe(false);
	});
});
