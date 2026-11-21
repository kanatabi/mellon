// D5 guard (SHADCN.md §5.1): mod+b toggles the rail everywhere EXCEPT inside
// a text surface — under `@replit/codemirror-vim`, Ctrl+B is page-up, and
// mod+b in an input is edit-chord. A keystroke in a text surface belongs to
// that surface. Focus decides, not the modifier.
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import SidebarProvider from './sidebar-provider.svelte';
import { SIDEBAR_KEYBOARD_SHORTCUT } from './constants.js';

// The provider renders its children through a snippet; `createRawSnippet`
// gives the test a real DOM with two aimable targets: a plain surface and
// a stand-in CodeMirror editor (`.cm-editor` is the only marker the guard
// matches on).
const children = createRawSnippet(() => ({
	render: () =>
		'<div><div data-testid="plain">x</div><div class="cm-editor" data-testid="editor">x</div></div>'
}));

function mount(onOpenChange: (v: boolean) => void) {
	return render(SidebarProvider, { open: true, onOpenChange, children });
}

describe('⌘B guard (D5)', () => {
	it('toggles when the target is a plain surface', () => {
		const onOpenChange = vi.fn();
		mount(onOpenChange);
		fireEvent.keyDown(screen.getByTestId('plain'), {
			key: SIDEBAR_KEYBOARD_SHORTCUT,
			ctrlKey: true
		});
		expect(onOpenChange).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it('does NOT toggle when the target is inside .cm-editor (vim: Ctrl+B is page-up)', () => {
		const onOpenChange = vi.fn();
		mount(onOpenChange);
		fireEvent.keyDown(screen.getByTestId('editor'), {
			key: SIDEBAR_KEYBOARD_SHORTCUT,
			ctrlKey: true
		});
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it('does NOT toggle when the target is an input', () => {
		const onOpenChange = vi.fn();
		mount(onOpenChange);
		const input = document.createElement('input');
		document.body.appendChild(input);
		fireEvent.keyDown(input, { key: SIDEBAR_KEYBOARD_SHORTCUT, metaKey: true });
		expect(onOpenChange).not.toHaveBeenCalled();
		input.remove();
	});

	it('is modifier-agnostic: meta+b inside .cm-editor is ignored too', () => {
		const onOpenChange = vi.fn();
		mount(onOpenChange);
		fireEvent.keyDown(screen.getByTestId('editor'), {
			key: SIDEBAR_KEYBOARD_SHORTCUT,
			metaKey: true
		});
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
