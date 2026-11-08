import type { Command } from './commands.ts';
import type { AdminPhoto } from './api/types.ts';

/**
 * Page-context commands (owner call 2026-11-08): the shell owns the palette,
 * but only the page knows its verbs — save/publish/unpublish/delete exist at
 * the code editor, nowhere else. Pages register their current set here; the
 * shell composes `base + page + recent` for the palette. Leaving the page (or
 * unmounting) must clear it — stale editor commands on the dashboard are a
 * UI bug waiting to happen, so the contract is: register in an effect, and
 * return the cleanup that resets to [].
 */
const store = $state<{
	list: Command[];
	insertPhoto: ((photo: AdminPhoto) => void) | null;
}>({ list: [], insertPhoto: null });

export function setPageCommands(list: Command[]): void {
	store.list = list;
}

/** Reactive read for the shell — tracks setPageCommands writes. */
export function pageCommands(): Command[] {
	return store.list;
}

/**
 * The insertion door (editor only): a page that can take `![alt](src)` at
 * its cursor publishes the handle; the palette's INSERT mode rows call it.
 * Same lifecycle contract as commands — set on mount, cleared on unmount,
 * so leaving the editor can never leave a stale door open.
 */
export function setPhotoInsert(fn: ((photo: AdminPhoto) => void) | null): void {
	store.insertPhoto = fn;
}

export function photoInsert(): ((photo: AdminPhoto) => void) | null {
	return store.insertPhoto;
}
