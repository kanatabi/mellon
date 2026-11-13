// form-shape.test.ts — static guard for the wizard's username-field invariant.
//
// WHY THIS EXISTS (live bug, mellon v1.0.0 era): the hidden `username` carrier
// rendered in BOTH modes; in register mode it held '' and came FIRST in
// document order, so `FormData.get('username')` returned the ghost — every
// real claim died as ErrBadUsername. The browser harness cannot catch it on a
// claimed estate (register mode never renders there), so we assert the
// CONDITIONAL STRUCTURE of the template itself instead: every [name=username]
// input must be guarded, and the two must be guarded disjointly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

type Field = { hidden: boolean; guards: string[] };

/** Walk the markup tracking {#if}/{:else} nesting; collect username inputs. */
function usernameFields(markup: string): Field[] {
	const fields: Field[] = [];
	const stack: string[] = [];
	const flip = (g: string) => (g.startsWith('!') ? g.slice(1) : '!' + g);
	// tokens: conditionals and input tags — both scanned in document order
	const token = /\{#if\s+([^}]+)\}|\{:else(?::if\s+([^}]+))?\}|(\{\/if\})|(<input\b[^>]*>)/gs;
	let m: RegExpExecArray | null;
	while ((m = token.exec(markup))) {
		if (m[1] !== undefined)
			stack.push(m[1].trim()); // {#if expr}
		else if (m[2] !== undefined)
			stack[stack.length - 1] = m[2].trim(); // {:else if expr}
		else if (m[3] !== undefined)
			stack.pop(); // {/if}
		else if (m[4] === undefined && stack.length)
			stack[stack.length - 1] = flip(stack[stack.length - 1]); // bare {:else}
		else if (m[4] !== undefined) {
			const tag = m[4];
			if (!/name="username"/.test(tag)) continue;
			fields.push({ hidden: /type="hidden"/.test(tag), guards: [...stack] });
		}
	}
	return fields;
}

describe('setup wizard form shape (ghost-field guard)', () => {
	const fields = usernameFields(SRC);

	it('renders exactly two username inputs total (carrier + claim)', () => {
		expect(fields).toHaveLength(2);
	});

	it('NO username input is unguarded (a top-level one is the ghost bug)', () => {
		for (const f of fields) expect(f.guards.length).toBeGreaterThan(0);
	});

	it('the hidden carrier renders only in change mode', () => {
		const hidden = fields.filter((f) => f.hidden);
		expect(hidden).toHaveLength(1);
		expect(hidden[0].guards.some((g) => /!registering|mode\s*===\s*'change'/.test(g))).toBe(true);
	});

	it('the visible claim input renders only in register mode', () => {
		const visible = fields.filter((f) => !f.hidden);
		expect(visible).toHaveLength(1);
		// either an explicit registering guard, or the {:else} branch of !registering
		expect(
			visible[0].guards.some((g) => /(^|[^\S])registering/.test(g) && !/!\s*registering/.test(g))
		).toBe(true);
	});

	it('guards are disjoint: no render context activates both inputs', () => {
		const hs = usernameFields(SRC).find((f) => f.hidden)!;
		const vs = usernameFields(SRC).find((f) => !f.hidden)!;
		const norm = (g: string) => g.replace(/\s+/g, '');
		// a shared guard string would render BOTH in one mode — the ghost bug's
		// shape; opposing polarity ('!x' vs 'x') is exactly what we require
		const shared = hs.guards.some((a) => vs.guards.some((b) => norm(a) === norm(b)));
		expect(shared).toBe(false);
		expect(
			hs.guards.every((a) =>
				vs.guards.every((b) => norm(a) === '!' + norm(b) || norm(b) === '!' + norm(a))
			)
		).toBe(true);
	});
});
