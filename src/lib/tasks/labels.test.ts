import { describe, expect, it } from 'vitest';
import { activityText, userLabel } from './labels.ts';

describe('activityText', () => {
	it('speaks the fixed verbs as sentences', () => {
		expect(activityText('created', '')).toBe('created the task');
		expect(activityText('completed', '')).toBe('completed the task');
		expect(activityText('reopened', '')).toBe('reopened the task');
		expect(activityText('commented', '')).toBe('commented');
		expect(activityText('deleted', '')).toBe('deleted the task');
	});

	it('reads the assigned detail as a person, including unassignment', () => {
		expect(activityText('assigned', 'sarah')).toBe('assigned to sarah');
		expect(activityText('assigned', 'unassigned')).toBe('unassigned');
		expect(activityText('assigned', '')).toBe('assigned');
	});

	it('reads the updated field list', () => {
		expect(activityText('updated', 'title, priority')).toBe('updated title, priority');
		expect(activityText('updated', '')).toBe('updated the task');
	});

	it('keeps an unknown future verb and its detail visible', () => {
		expect(activityText('archived', 'by owner')).toBe('archived · by owner');
		expect(activityText('archived', '')).toBe('archived');
	});
});

describe('userLabel', () => {
	it('names a deleted user honestly', () => {
		expect(userLabel('sarah')).toBe('sarah');
		expect(userLabel(null)).toBe('deleted user');
	});
});
