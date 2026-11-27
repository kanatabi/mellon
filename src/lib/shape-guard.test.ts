import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Shape guard (v2, 2026-11-27): `rounded-full` is a MEANING, never the default
 * control shape. The reviewed legitimate uses are:
 *
 *   - icon-only controls            → `size-*`, `p-1`, `p-1.5`, `p-0.5`
 *   - status dots / badges / bars   → `size-*`, `h-1.5`/`h-2`/`h-3`/`h-4`, `min-w-4`
 *   - avatars, swatches, switch     → `size-*`, `h-6 w-11`
 *   - slider tracks                 → `h-3`/`h-4`, `inset-0`
 *   - the two search fields         → pill by doctrine (⌘K, tag vocabulary)
 *   - the two TAB strips            → owner exception (2026-11-27 screenshot:
 *                                     the diff + task-drawer tabs keep the
 *                                     pre-Linear pill switcher)
 *
 * A text button or a filter chip in a full circle is the retired 2026-11 cast
 * and fails. The scale: 8px text buttons/inputs/surfaces, 6px chips/cells,
 * 4px tags, full only for the marks above.
 */
const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const PILL_TABS = new Map([
	[
		'src/routes/(app)/posts/[slug]/diff/+page.svelte',
		/rounded-full px-3 py-1(?: font-mono)? text-xs/
	],
	[
		'src/lib/components/tasks/TaskDrawer.svelte',
		/rounded-full px-3 py-1(?: font-mono)? text-\[11px\]/
	]
]);

const ALLOWED = [
	/\bsize-(?:\d|full|\[)/, // avatars, icon buttons, dots, swatches
	/\bp-1(?:\.5)?\b/, // icon-only padding (X, clear, hint)
	/\bp-0\.5\b/, // micro icon inside a chip
	/\bh-1\.5\b/,
	/\bh-2\b/,
	/\bh-3\b/,
	/\bh-4\b/,
	/\bh-6 w-11\b/, // switch track
	/\bmin-w-4\b/, // count badge
	/\binset-0\b/, // slider track fill
	/px-4 py-2/, // topbar ⌘K field (pill by doctrine)
	/bg-transparent px-3 py-1\.5/ // tag vocabulary search (pill by doctrine)
];

function svelteFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...svelteFiles(full));
		else if (entry.endsWith('.svelte')) out.push(full);
	}
	return out;
}

describe('shape guard (circles are meaning, not style)', () => {
	it('every rounded-full line carries a reviewed mark signature', () => {
		const offenders: string[] = [];
		for (const file of svelteFiles(SRC)) {
			const rel = relative(ROOT, file);
			const tabLine = PILL_TABS.get(rel);
			for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
				if (!line.includes('rounded-full')) continue;
				if (ALLOWED.some((re) => re.test(line))) continue;
				if (tabLine?.test(line)) continue;
				offenders.push(`${rel}:${i + 1}`);
			}
		}
		expect(offenders, `pill-shaped controls returned at:\n${offenders.join('\n')}`).toEqual([]);
	});

	it('text buttons and filter chips are rectangles', () => {
		const button = readFileSync(join(SRC, 'lib/components/ui/button/button.svelte'), 'utf8');
		const primary = button.match(/primary:\s*'([^']+)'/)?.[1] ?? '';
		expect(primary).not.toContain('rounded-full');
		const pill = readFileSync(join(SRC, 'lib/components/Pill.svelte'), 'utf8');
		expect(pill).toContain('rounded-md');
		expect(pill).not.toContain('rounded-full');
	});
});
