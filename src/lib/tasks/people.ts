import type { TaskMember } from '#lib/api/types.ts';

/**
 * Display names are free text (and may legally collide); usernames and user
 * ids stay unique. Pickers show the display name, and append the handle only
 * when the label would otherwise be ambiguous. The MAP is keyed by userId —
 * every selection still travels as the identity, never as a label.
 */
export function memberLabels(members: readonly TaskMember[]): Map<string, string> {
	const counts = new Map<string, number>();
	for (const member of members) counts.set(member.name, (counts.get(member.name) ?? 0) + 1);
	const labels = new Map<string, string>();
	for (const member of members) {
		labels.set(
			member.userId,
			(counts.get(member.name) ?? 0) > 1 ? `${member.name} (@${member.username})` : member.name
		);
	}
	return labels;
}

/**
 * The invite field's mention grammar: a LEADING "@" switches the field from
 * free-text username to the people search, and the term is everything after
 * it. Anything else returns null — plain typing stays the typed-username path.
 */
export function mentionQuery(value: string): string | null {
	const trimmed = value.trimStart();
	if (!trimmed.startsWith('@')) return null;
	return trimmed.slice(1).trim();
}
