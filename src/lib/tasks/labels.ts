/**
 * Task copy that must not drift between the list, the drawer and the
 * dashboard: the priority vocabulary (lumen's `CHECK` values), the activity
 * timeline's verbs, and the null-author convention ("deleted user", the wire
 * contract's honest placeholder).
 */
import type { TaskPriority } from '#lib/api/types.ts';

/** The priority picker's options, most urgent first — the same order the
 *  badges and the sort comparator speak. */
export const PRIORITIES: { value: TaskPriority; label: string }[] = [
	{ value: 'high', label: 'high' },
	{ value: 'medium', label: 'medium' },
	{ value: 'low', label: 'low' },
	{ value: 'none', label: 'none' }
];

/** The activity table's verbs are lumen's; only the reading is ours. */
export function activityText(verb: string, detail: string): string {
	switch (verb) {
		case 'created':
			return 'created the task';
		case 'assigned':
			return detail === 'unassigned' ? 'unassigned' : detail ? `assigned to ${detail}` : 'assigned';
		case 'completed':
			return 'completed the task';
		case 'reopened':
			return 'reopened the task';
		case 'commented':
			return 'commented';
		case 'updated':
			return detail ? `updated ${detail}` : 'updated the task';
		case 'deleted':
			return 'deleted the task';
		default:
			// An unknown future verb reads as itself, plus its detail — never a
			// silently swallowed activity row.
			return detail ? `${verb} · ${detail}` : verb;
	}
}

/** Creators/authors are nullable (the user row may be deleted; history
 *  survives). The wire contract names the rendering. */
export function userLabel(username: string | null): string {
	return username ?? 'deleted user';
}
