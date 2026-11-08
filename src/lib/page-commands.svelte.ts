import type { Command } from './commands.ts';
import type { AdminPhoto } from './api/types.ts';

/** What a finished photo pick MEANS — one picker engine, many destinations
 *  (cursor insertion, cover assignment…): the arming command declares the
 *  task, the mounted page owns the handler. */
export type PhotoTask = 'insert' | 'cover';

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
	tasks: Partial<Record<PhotoTask, (photo: AdminPhoto) => void>>;
}>({ list: [], tasks: {} });

export function setPageCommands(list: Command[]): void {
	store.list = list;
}

/** Reactive read for the shell — tracks setPageCommands writes. */
export function pageCommands(): Command[] {
	return store.list;
}

/**
 * The photo-task doors (editor-mounted): a page that can TAKE a photo
 * publishes its handler per task; the palette's pick rows call it.
 * Same lifecycle contract as commands — set on mount, cleared on unmount,
 * so leaving the editor can never leave a stale door.
 */
export function setPhotoTask(task: PhotoTask, fn: ((photo: AdminPhoto) => void) | null): void {
	if (fn) store.tasks[task] = fn;
	else delete store.tasks[task];
}

export function photoTask(task: PhotoTask): ((photo: AdminPhoto) => void) | null {
	return store.tasks[task] ?? null;
}
