import { describe, expect, it } from 'vitest';
import type { TaskMember } from '#lib/api/types.ts';
import { memberLabels, mentionQuery } from './people.ts';

function member(userId: string, username: string, name: string): TaskMember {
	return {
		userId,
		username,
		name,
		role: 'member',
		invitedBy: null,
		joinedAt: '2026-11-01T00:00:00Z'
	};
}

describe('memberLabels', () => {
	it('uses the display name when it is unambiguous', () => {
		const labels = memberLabels([
			member('u1', 'admin', 'Faiz Rahman'),
			member('u2', 'sarah', 'Sarah Lim')
		]);
		expect(labels.get('u1')).toBe('Faiz Rahman');
		expect(labels.get('u2')).toBe('Sarah Lim');
	});

	it('appends the handle only where display names collide', () => {
		const labels = memberLabels([
			member('u1', 'sarah', 'Sarah Lim'),
			member('u2', 's.lim', 'Sarah Lim'),
			member('u3', 'budi', 'Budi Santoso')
		]);
		expect(labels.get('u1')).toBe('Sarah Lim (@sarah)');
		expect(labels.get('u2')).toBe('Sarah Lim (@s.lim)');
		expect(labels.get('u3')).toBe('Budi Santoso');
	});

	it('keeps the keys as user ids — labels never become identity', () => {
		const labels = memberLabels([member('u1', 'admin', 'Faiz Rahman')]);
		expect([...labels.keys()]).toEqual(['u1']);
	});
});

describe('mentionQuery', () => {
	it('opens on a leading @ and drops surrounding space', () => {
		expect(mentionQuery('@sarah')).toBe('sarah');
		expect(mentionQuery('  @sarah  ')).toBe('sarah');
		expect(mentionQuery('@')).toBe('');
		expect(mentionQuery('@ sarah')).toBe('sarah');
	});

	it('leaves plain usernames and emails on the free-text path', () => {
		expect(mentionQuery('sarah')).toBeNull();
		expect(mentionQuery('sarah@example.com')).toBeNull();
		expect(mentionQuery('')).toBeNull();
	});
});
