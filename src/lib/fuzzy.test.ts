import { describe, expect, it } from 'vitest';
import { fuzzyScore, rankByFuzzy } from './fuzzy.ts';

describe('fuzzy (secrets search, D3)', () => {
	it('empty query scores 0 and ranks as identity', () => {
		expect(fuzzyScore('', 'anything')).toBe(0);
		const items = ['a', 'b', 'c'];
		expect(rankByFuzzy('', items, (x) => [x])).toEqual(items);
	});

	it('subsequence matches, broken ones drop', () => {
		expect(fuzzyScore('url', 'DB_URL')).not.toBeNull();
		expect(fuzzyScore('dbu', 'DB_URL')).not.toBeNull();
		expect(fuzzyScore('xyz', 'DB_URL')).toBeNull();
		expect(fuzzyScore('lru', 'DB_URL')).toBeNull(); // order is not subsequence
	});

	it('locality bias: contiguous + word-start beat scattered', () => {
		const exact = fuzzyScore('db_url', 'DB_URL')!;
		const scattered = fuzzyScore('dbrl', 'DB_URL')!;
		expect(exact).toBeGreaterThan(scattered);
		const wordStart = fuzzyScore('se', 'SECRET_MARKER')!;
		const midWord = fuzzyScore('ec', 'SECRET_MARKER')!;
		expect(wordStart).toBeGreaterThan(midWord);
	});

	it('case-insensitive', () => {
		expect(fuzzyScore('Pub', 'PUBLIC_API_BASE')).not.toBeNull();
		expect(fuzzyScore('PUB', 'public_api_base')).not.toBeNull();
	});

	it('rankByFuzzy filters AND orders best-first (multi-field)', () => {
		type Row = { k: string; v: string };
		const rows: Row[] = [
			{ k: 'DB_HOST', v: 'prod-cluster' },
			{ k: 'MEILI_KEY', v: 'dev-meili-key' },
			{ k: 'SESSION_JWT_SECRET', v: 'zzz' }
		];
		const byKey = rankByFuzzy('db', rows, (r) => [r.k, r.v]);
		expect(byKey[0].k).toBe('DB_HOST');
		expect(byKey.some((r) => r.k === 'MEILI_KEY')).toBe(false);
		// value-only match: "meili" hits through the VALUE field
		const byValue = rankByFuzzy('meili', rows, (r) => [r.k, r.v]);
		expect(byValue.map((r) => r.k)).toEqual(['MEILI_KEY']);
		// equal scores keep original order (stable)
		const dupes = rankByFuzzy(
			'a',
			[
				{ k: 'a', v: '' },
				{ k: 'x', v: 'a' }
			],
			(r) => [r.k, r.v]
		);
		expect(dupes[0].k).toBe('a');
	});
});
