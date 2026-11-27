import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Shape guard (2026-11-27, the Linear round): `rounded-full` is a MEANING,
 * not a style — avatars, count badges, status dots, color swatches and switch
 * tracks. Interactive controls are 6px (`rounded-md`), tags 4px
 * (`rounded-sm`). Without a guard the pill cast creeps back in one component
 * at a time; the whitelist below is the reviewed set of files where a circle
 * is honest. Add a file only when the circle IS the meaning, never for a
 * button.
 */
const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const WHITELIST = new Set([
	// identity + counters
	'src/lib/components/UserMenu.svelte',
	'src/lib/components/notifications/NotificationBell.svelte',
	// status/unread dots and the single-letter chip
	'src/lib/components/ErrorPanel.svelte',
	'src/lib/components/SectionCard.svelte',
	'src/lib/components/PostEditor.svelte',
	'src/lib/components/notifications/NotificationPanel.svelte',
	'src/lib/components/tasks/TaskDrawer.svelte',
	'src/lib/components/tasks/TaskRow.svelte',
	'src/lib/dashboard/widgets/recent-tags/body.svelte',
	'src/lib/dashboard/widgets/tasks/body.svelte',
	'src/routes/(app)/posts/+page.svelte', // list count badge
	'src/routes/(app)/photos/+page.svelte', // selection count badge
	// swatches, slider tracks/thumbs, the gallery toggle switch
	'src/lib/components/ColorPicker.svelte',
	'src/routes/(app)/photos/[id]/+page.svelte',
	// the theme PREVIEW's abstract skeleton bars/dots (not controls)
	'src/lib/components/ThemePane.svelte'
]);

function svelteFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...svelteFiles(full));
		else if (entry.endsWith('.svelte')) out.push(full);
	}
	return out;
}

describe('shape guard (one roundness scale)', () => {
	it('rounded-full appears only where the circle is the meaning', () => {
		const offenders = svelteFiles(SRC)
			.filter((file) => !WHITELIST.has(relative(ROOT, file)))
			.filter((file) => readFileSync(file, 'utf8').includes('rounded-full'))
			.map((file) => relative(ROOT, file));
		expect(offenders, `retired pill cast in: ${offenders.join(', ')}`).toEqual([]);
	});
});
