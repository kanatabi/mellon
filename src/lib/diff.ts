/**
 * Minimal line diff for the secrets version side-sheet (§11.4). LCS over
 * lines — deliberately tiny (no dependency); the diff view is a review aid,
 * not git. Colored via --diff-add/--diff-del additive tokens at the call site.
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
