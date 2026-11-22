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
export type SplitRow = {
	ln: { left: number | null; right: number | null };
	left: DiffOp | null;
	right: DiffOp | null;
};

/** The per-key diff table's row — the OTHER grain (the parsed-map view:
 *  one row per key/field, from→to, the status). The shared contract for
 *  DiffTable (one anatomy, two consumers: the configs/compare's table
 *  presentation + the post diff page's metadata tab). `label` = the
 *  display name when the key is too machine ('preview' etc.); the fixed-
 *  shape rows (the post's fields) never emit added/removed. */
export type DiffTableRow = {
	key: string;
	label?: string;
	from: string | null;
	to: string | null;
	status: 'same' | 'changed' | 'added' | 'removed';
};

export function alignDiff(ops: DiffOp[]): SplitRow[] {
	const rows: SplitRow[] = [];
	let leftNo = 0;
	let rightNo = 0;
	const bump = (op: DiffOp) => {
		if (op.kind === 'same') {
			leftNo++;
			rightNo++;
		} else if (op.kind === 'del') {
			leftNo++;
		} else {
			rightNo++;
		}
	};
	const numbered = (op: DiffOp): DiffOp => {
		bump(op);
		return op;
	};
	const noLn = { left: null as number | null, right: null as number | null };
	let i = 0;
	while (i < ops.length) {
		if (ops[i].kind === 'same') {
			const op = numbered(ops[i]);
			rows.push({
				ln: { left: leftNo, right: rightNo },
				left: { kind: 'same', text: op.text },
				right: { kind: 'same', text: op.text }
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
			const left = k < dels.length ? { kind: 'del' as const, text: dels[k] } : null;
			const right = k < adds.length ? { kind: 'add' as const, text: adds[k] } : null;
			const ln = { ...noLn };
			if (left) {
				leftNo++;
				ln.left = leftNo;
			}
			if (right) {
				rightNo++;
				ln.right = rightNo;
			}
			rows.push({ ln, left, right });
		}
	}
	return rows;
}
