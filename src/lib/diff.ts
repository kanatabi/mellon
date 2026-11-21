/**
 * Minimal line diff — the PURE generic engine (no dependency; the diff view
 * is a review aid, not git). LCS over lines; colored via --diff-add/--diff-del
 * additive tokens at the call site. Born for the secrets version side-sheet
 * (§11.4), generalized when the post editor's diff page needed the same
 * pairing: SplitRow/alignDiff live HERE because nothing in them is
 * secret-shaped — they pair any two line sequences.
 */
export type DiffOp = { kind: 'same' | 'add' | 'del'; text: string };

export function diffLines(before: string, after: string): DiffOp[] {
	const a = before.split('\n');
	const b = after.split('\n');
	// LCS table (fine for env-file-sized inputs; guard against pathological sizes)
	const n = a.length;
	const m = b.length;
	const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const out: DiffOp[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ kind: 'same', text: a[i] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			out.push({ kind: 'del', text: a[i++] });
		} else {
			out.push({ kind: 'add', text: b[j++] });
		}
	}
	while (i < n) out.push({ kind: 'del', text: a[i++] });
	while (j < m) out.push({ kind: 'add', text: b[j++] });
	return out;
}

/** Split-pane pairing. LCS output arrives as alternating same / del-run /
 *  add-run (diffLines always flushes dels before adds in a change block);
 *  pair them index-for-index and null-pad the shorter side so both panes
 *  keep the SAME row count — the Gitlab alignment that makes scanning work.
 *  Generic: secrets version-compare and the post diff page both render this. */
export type SplitRow = { left: DiffOp | null; right: DiffOp | null };

export function alignDiff(ops: DiffOp[]): SplitRow[] {
	const rows: SplitRow[] = [];
	let i = 0;
	while (i < ops.length) {
		if (ops[i].kind === 'same') {
			const text = ops[i].text;
			rows.push({
				left: { kind: 'same', text },
				right: { kind: 'same', text }
			});
			i++;
			continue;
		}
		const dels: string[] = [];
		const adds: string[] = [];
		while (i < ops.length && ops[i].kind === 'del') dels.push(ops[i++].text);
		while (i < ops.length && ops[i].kind === 'add') adds.push(ops[i++].text);
		const height = Math.max(dels.length, adds.length);
		for (let k = 0; k < height; k++) {
			rows.push({
				left: k < dels.length ? { kind: 'del', text: dels[k] } : null,
				right: k < adds.length ? { kind: 'add', text: adds[k] } : null
			});
		}
	}
	return rows;
}
