/**
 * The auth-gate guard (2026-11-15): EVERY (app) page load must open with
 * `requireAuthed` — the cheap LOCAL cookie check. The layout's redirect
 * cannot do this job: SvelteKit runs layout and page loads in PARALLEL,
 * so an unauthenticated request (kubelet probes on `/`, a dead session)
 * fired the page's lumen dials anyway — four 401s at lumen per probe,
 * forever (observed live in production). The relay route guards itself
 * (its own isAuthed check); the api/ dir is excluded here on purpose.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else if (p.endsWith('+page.server.ts')) out.push(p);
	}
	return out;
}

describe('the (app) auth gate', () => {
	it('every page load opens with requireAuthed (no dial-with-a-dead-session)', () => {
		const pages = walk('src/routes/(app)').filter((p) => !p.includes('/api/'));
		expect(pages.length).toBeGreaterThan(0);
		const unguarded = pages.filter((p) => !readFileSync(p, 'utf8').includes('requireAuthed('));
		expect(unguarded).toEqual([]);
	});
});
