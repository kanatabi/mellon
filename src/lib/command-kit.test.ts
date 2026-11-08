import { describe, expect, it } from 'vitest';
import { editField, stateToggle, vocabSubmenu } from './command-kit.ts';
import type { Command } from './commands.ts';

describe('command kit', () => {
	it('editField shapes a seeded buffer command (date opt-in)', () => {
		const c = editField({
			id: 'x.title',
			title: 'Set title',
			pill: 'title',
			seed: 'hi',
			commit: () => {}
		});
		expect(c).toMatchObject({
			id: 'x.title',
			group: 'actions',
			edit: true,
			seed: 'hi',
			pillLabel: 'title'
		});
		expect(c.editKind).toBeUndefined();
		const d = editField({
			id: 'x.date',
			title: 'Set date',
			pill: 'date',
			seed: '2026-01-01',
			date: true,
			commit: () => {}
		});
		expect(d.editKind).toBe('date');
	});

	it('stateToggle puts the CURRENT STATE in the hint column', () => {
		const on = stateToggle({
			id: 't',
			title: 'Toggle gallery',
			on: true,
			onHint: 'in gallery',
			offHint: 'hidden',
			run: () => {}
		});
		expect(on.shortcut).toBe('in gallery');
		const off = stateToggle({
			id: 't',
			title: 'Toggle gallery',
			on: false,
			onHint: 'in gallery',
			offHint: 'hidden',
			run: () => {}
		});
		expect(off.shortcut).toBe('hidden');
		// defaults for the bare on/off pair (vim, wrap)
		expect(stateToggle({ id: 'v', title: 'Toggle vim', on: true, run: () => {} }).shortcut).toBe(
			'on'
		);
		// keepOpen is opt-in (a plain toggle closes like every row)
		expect(on.keepOpen).toBeUndefined();
		expect(
			stateToggle({ id: 'g', title: 'x', on: false, keepOpen: true, run: () => {} }).keepOpen
		).toBe(true);
	});

	it('vocabSubmenu: ✓ marks live rows, keepOpen everywhere, hints for the off rows', () => {
		const picked: string[] = [];
		const parent = vocabSubmenu({
			id: 'tags',
			title: 'Edit tags',
			vocab: [
				{ name: 'alpha', hint: '3 posts' },
				{ name: 'beta', hint: '0 posts' }
			],
			isOn: (n) => n === 'alpha',
			pick: (n) => picked.push(n)
		});
		expect(parent.children?.map((c) => c.shortcut)).toEqual(['✓ on', '0 posts']);
		expect(parent.children?.every((c) => c.keepOpen)).toBe(true);
		parent.children![1].run!();
		expect(picked).toEqual(['beta']);
	});

	it('the create door only opens on a real miss — and rides through creation', () => {
		const created: string[] = [];
		const parent = vocabSubmenu({
			id: 'tags',
			title: 'Edit tags',
			vocab: [{ name: 'alpha', hint: '1 post' }],
			isOn: () => false,
			pick: () => {},
			create: (raw) => {
				const q = raw.trim().toLowerCase();
				if (!q || q === 'alpha') return null;
				return { name: q, ride: Promise.resolve() };
			},
			onCreated: (n) => created.push(n)
		});
		const child = parent.createChild!('  Beta  ');
		expect(child).not.toBeNull();
		expect(child!.title).toBe('+ create “Beta”');
		expect(child!.keepOpen).toBe(true);
		child!.run!();
		return Promise.resolve().then(() => {
			expect(created).toEqual(['beta']);
			// exact vocabulary hits and blank filter: no phantom create row
			expect(parent.createChild!('alpha')).toBeNull();
			expect(parent.createChild!('   ')).toBeNull();
		});
	});

	it('no create door → no createChild, plain toggling submenu', () => {
		const parent: Command = vocabSubmenu({
			id: 'x',
			title: 'X',
			vocab: [],
			isOn: () => false,
			pick: () => {}
		});
		expect(parent.createChild).toBeUndefined();
		expect(parent.children).toEqual([]);
	});
});
