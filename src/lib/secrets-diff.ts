/**
 * secrets-diff.ts — the PURE heart of the version-compare surface
 * (PLAN-SECRETS-CONTROL owner round: "compare two versions like GitHub/
 * Gitlab, two modes"). One pipeline, three presentations:
 *
 *   payloads ──(content: parsed lines | raw JSON)──▶ masked-aware lines
 *            ──diffLines (existing LCS)──▶ DiffOp[]
 *            ──alignDiff──▶ paired split rows        (side-by-side)
 *            ──(ops as-is)──▶ inline ± lines         (unified)
 *   payloads ──tableDiff──▶ per-key status rows     (the config-shaped view)
 *
 * Values are masked BEFORE serialization when reveal is off (displayValue):
 * even the RAW view cannot leak a long secret on the default screen —
 * masking is a property of what is DIFFED, not of what is painted.
 * Everything here is pure and offline-testable, like the rest of the house.
 */
import { diffLines, type DiffOp } from './diff.ts';

export type Data = Record<string, string>;

/** The display form of one value: plain when revealed (or short — a 4-char
 *  value is not a secret worth hiding from its own owner), dots otherwise,
 *  capped so length itself leaks little. */
export function displayValue(v: string, reveal: boolean): string {
	if (reveal) return v;
	return /^.{0,6}$/.test(v) ? v : '•'.repeat(Math.min(v.length, 12));
}

/** Parsed content: sorted KEY=value lines — the shape you read when config
 *  is config, stable across versions regardless of insert order. */
export function toParsedLines(data: Data, reveal: boolean): string {
	return Object.keys(data)
		.sort()
		.map((k) => `${k}=${displayValue(data[k], reveal)}`)
		.join('\n');
}

/** Raw content: the payload re-serialized — sorted keys (parsed parity so
 *  key ORDER never fakes a diff), 2-space JSON. Values pass through the
 *  SAME mask rule before stringify: raw honest bytes only when revealed. */
export function toRawJson(data: Data, reveal: boolean): string {
	const copy: Data = {};
	for (const k of Object.keys(data).sort()) copy[k] = displayValue(data[k], reveal);
	return JSON.stringify(copy, null, 2);
}

export type CompareContent = 'parsed' | 'raw';

/** The full line-diff for a content mode — the engine inline and split share. */
export function diffSecrets(
	from: Data,
	to: Data,
	content: CompareContent,
	reveal: boolean
): DiffOp[] {
	const a = content === 'raw' ? toRawJson(from, reveal) : toParsedLines(from, reveal);
	const b = content === 'raw' ? toRawJson(to, reveal) : toParsedLines(to, reveal);
	if (a === b) return [{ kind: 'same', text: a || '∅ (empty bundle)' }];
	return diffLines(a, b);
}

/** Split-pane pairing. LCS output arrives as alternating same / del-run /
 *  add-run (diffLines always flushes dels before adds in a change block);
 *  pair them index-for-index and null-pad the shorter side so both panes
 *  keep the SAME row count — the Gitlab alignment that makes scanning work. */
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

/** The config-shaped view: one row per key, its story on one line. */
export type TableRow = {
	key: string;
	from: string | null;
	to: string | null;
	status: 'same' | 'added' | 'removed' | 'changed';
};

export function tableDiff(from: Data, to: Data): TableRow[] {
	const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort();
	return keys.map((key) => {
		const f = key in from ? from[key] : null;
		const t = key in to ? to[key] : null;
		const status: TableRow['status'] =
			f === null ? 'added' : t === null ? 'removed' : f === t ? 'same' : 'changed';
		return { key, from: f, to: t, status };
	});
}

/** Envs in HUMAN order: dev → staging → production; anything else sorts in
 *  after them alphabetically. The rail data is alphabetical; nobody reads
 *  'dev, production, staging' (owner screenshot, twice). */
const ENV_RANK: Record<string, number> = { dev: 0, staging: 1, production: 2 };

export function orderEnvs(envs: string[]): string[] {
	return [...envs].sort((a, b) => {
		const ra = ENV_RANK[a] ?? 99;
		const rb = ENV_RANK[b] ?? 99;
		return ra !== rb ? ra - rb : a.localeCompare(b);
	});
}
