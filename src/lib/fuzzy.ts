/**
 * Tiny pure fuzzy matcher for the secrets search bar (PLAN-SECRETS-CONTROL
 * B2, D3: current-env rows only, key names AND values, client-side — a
 * server search would flow secret bytes through a surface that never needs
 * to see them). Subsequence match with locality bias: contiguous beats
 * scattered, word starts earn a bonus; scores are opaque, ORDER is the
 * contract (plus the identity rule: empty query changes nothing).
 */

export function fuzzyScore(query: string, text: string): number | null {
	if (!query) return 0;
	const q = query.toLowerCase();
	const t = text.toLowerCase();
	let score = 0;
	let ti = 0;
	let streak = 0;
	for (let qi = 0; qi < q.length; qi++) {
		const ch = q[qi];
		const found = t.indexOf(ch, ti);
		if (found === -1) return null; // subsequence broken: no match
		const gap = found - ti;
		streak = gap === 0 ? streak + 1 : 0;
		score += 1 + streak * 4 + (gap === 0 ? 1 : 0);
		if (found === 0 || /[^A-Za-z0-9]/.test(t[found - 1])) score += 6; // word start
		score -= Math.min(gap, 8); // distance penalty, capped
		ti = found + 1;
	}
	return score;
}

/** Rank items by best-of-fields score; non-matches drop out, order is
 *  score DESC then original position (stable). */
export function rankByFuzzy<T>(query: string, items: T[], fields: (item: T) => string[]): T[] {
	if (!query) return [...items];
	const scored: { item: T; score: number; idx: number }[] = [];
	items.forEach((item, idx) => {
		let best: number | null = null;
		for (const f of fields(item)) {
			const s = fuzzyScore(query, f);
			if (s !== null && (best === null || s > best)) best = s;
		}
		if (best !== null) scored.push({ item, score: best, idx });
	});
	return scored.sort((a, b) => b.score - a.score || a.idx - b.idx).map((x) => x.item);
}
