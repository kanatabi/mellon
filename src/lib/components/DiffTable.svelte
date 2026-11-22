<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DiffTableRow } from '#lib/diff.ts';

	/**
	 * DiffTable — the per-key diff table, ONE anatomy for both consumers
	 * (the owner's unification, 2026-11-22): the configs/compare's `table`
	 * presentation and the post diff page's Metadata tab were the SAME
	 * grain ({key, from, to, status}) built twice with different markups.
	 *
	 * The component owns the SKELETON: the semantic table, the column
	 * headings, the row borders, the same-row dimming, the status CHIP
	 * column (the four-status vocabulary — the post's fixed-shape fields
	 * simply never emit added/removed), and the optional foot line.
	 *
	 * The VALUE CELLS are the caller's snippets (rendered inside the rows)
	 * — the configs' cells mask + truncate + title (the secrets' redaction
	 * grammar must never leak via a hover title); the post's cells wrap,
	 * clamp, and render thumbnails. The tints = the shared DIFF_BLOCK
	 * classes at the call sites.
	 */
	interface Props {
		rows: DiffTableRow[];
		fromHeading: string;
		toHeading: string;
		/** The value cells — the snippet renders the ENTIRE <td> (the cell
		 *  grammar is the caller's: masking, truncation, thumbnails). */
		cell: Snippet<[DiffTableRow, 'from' | 'to']>;
		/** The line under the table (the changed-count, the unchanged-count). */
		foot?: Snippet;
		keyHeading?: string;
	}

	let { rows, fromHeading, toHeading, cell, foot, keyHeading = 'key' }: Props = $props();

	const chip: Record<DiffTableRow['status'], string> = {
		added: 'bg-diff-add/15 text-diff-add',
		removed: 'bg-diff-del/15 text-diff-del',
		changed: 'bg-accent-amber/15 text-accent-amber',
		same: 'text-muted-foreground/60'
	};
</script>

<div class="overflow-x-auto rounded-lg border border-border bg-card">
	<table class="w-full font-mono text-xs">
		<thead>
			<tr class="border-b border-border text-left text-muted-foreground">
				<th class="px-4 py-2 font-medium">{keyHeading}</th>
				<th class="px-4 py-2 font-medium">{fromHeading}</th>
				<th class="px-4 py-2 font-medium">{toHeading}</th>
				<th class="px-4 py-2 text-right font-medium">status</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.key)}
				<tr
					class="border-b border-border/50 last:border-0 {row.status === 'same'
						? 'opacity-60'
						: ''}"
				>
					<td class="px-4 py-2 whitespace-nowrap">{row.label ?? row.key}</td>
					{@render cell(row, 'from')}
					{@render cell(row, 'to')}
					<td class="px-4 py-2 text-right">
						<span class="rounded-full px-2 py-0.5 {chip[row.status]}">{row.status}</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if foot}
		<div class="px-4 py-2 text-[10px] text-muted-foreground/70">
			{@render foot()}
		</div>
	{/if}
</div>
