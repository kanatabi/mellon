<script lang="ts">
	import { MoreHorizontal, Plus } from 'lucide-svelte';
	import * as Select from '#lib/components/ui/select/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { client, errorText } from '#lib/api/client.ts';
	import type { TaskProject } from '#lib/api/types.ts';
	import { TASK_SORTS, type TaskSort } from '#lib/tasks/list.ts';
	import { flash } from '#lib/flash.svelte.ts';
	import ProjectSettingsDialog from './ProjectSettingsDialog.svelte';

	/**
	 * The projects sub-sidebar: the caller's memberships, the project
	 * filter, the new-project door (tasks:create), the per-project settings
	 * menu (tasks:manage + project admin), and the SORT control (C6 —
	 * presentation only). Below lg the same block becomes a horizontal chip
	 * strip above the list; the sort stays a real control in both shapes.
	 */
	interface Props {
		projects: TaskProject[];
		selectedId: string | null;
		sort: TaskSort;
		/** Bindable so an empty-state button can open the form. */
		creating?: boolean;
		/** The first workspace read is still in flight. */
		loading: boolean;
		canCreate: boolean;
		canManage: boolean;
		/** The signed-in principal (the roster's "you" marker). */
		viewerId: string;
		onselect: (id: string | null) => void;
		onsort: (sort: TaskSort) => void;
		onChanged: () => void;
		onDeleted: (id: string) => void;
	}

	let {
		projects,
		selectedId,
		sort,
		creating = $bindable(false),
		loading,
		canCreate,
		canManage,
		viewerId,
		onselect,
		onsort,
		onChanged,
		onDeleted
	}: Props = $props();

	let nameDraft = $state('');
	let createBusy = $state(false);
	let createError = $state<string | null>(null);
	let settingsId = $state<string | null>(null);
	let nameInput = $state<HTMLElement | null>(null);

	// The form mounts on demand; the ref binding is the focus trigger.
	$effect(() => {
		if (creating) nameInput?.focus();
	});

	const settingsProject = $derived(projects.find((p) => p.id === settingsId) ?? null);
	const totals = $derived(
		projects.reduce(
			(acc, p) => ({ open: acc.open + p.openCount, tasks: acc.tasks + p.taskCount }),
			{ open: 0, tasks: 0 }
		)
	);

	// A role can change under the dialog (self-demotion, or another admin's
	// edit landing on the next refresh). The door closes with the grant.
	$effect(() => {
		if (settingsProject && settingsProject.role !== 'admin') settingsId = null;
	});

	async function createProject() {
		const name = nameDraft.trim();
		if (!name || createBusy) return;
		createBusy = true;
		createError = null;
		try {
			const created = await client.taskProjectCreate(name);
			nameDraft = '';
			creating = false;
			flash({
				kind: 'ok',
				title: 'Project created',
				description: canManage
					? `${created.name} — invite the people who share the work`
					: created.name
			});
			onselect(created.id);
		} catch (e) {
			createError = errorText(e);
		} finally {
			createBusy = false;
		}
	}

	function projectDeleted(id: string) {
		settingsId = null;
		onDeleted(id);
	}
</script>

<aside class="flex shrink-0 flex-col gap-2.5 lg:w-60" aria-label="Projects">
	<div class="flex items-center justify-between gap-2">
		<p class="font-mono text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
			projects
		</p>
		{#if canCreate && !creating && !loading}
			<button
				type="button"
				class="flex items-center gap-1 rounded-sm px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
				onclick={() => {
					createError = null;
					creating = true;
				}}
			>
				<Plus class="size-3" aria-hidden="true" />
				new
			</button>
		{/if}
	</div>

	{#if creating}
		<form
			class="flex flex-col gap-1.5"
			onsubmit={(e) => {
				e.preventDefault();
				void createProject();
			}}
		>
			<Input
				bind:value={nameDraft}
				bind:ref={nameInput}
				placeholder="project name"
				aria-label="New project name"
				autocomplete="off"
				class="text-xs"
			/>
			<div class="flex items-center gap-1.5">
				<Button
					type="submit"
					variant="primary"
					class="px-3 py-1 text-xs disabled:opacity-40"
					disabled={!nameDraft.trim() || createBusy}
				>
					{createBusy ? 'Creating…' : 'Create'}
				</Button>
				<Button
					type="button"
					variant="quiet"
					class="px-2.5 py-1"
					disabled={createBusy}
					onclick={() => {
						creating = false;
						nameDraft = '';
						createError = null;
					}}
				>
					Cancel
				</Button>
			</div>
			{#if createError}
				<p class="font-mono text-[11px] break-words text-danger" role="alert">{createError}</p>
			{/if}
		</form>
	{/if}

	{#if loading && projects.length === 0}
		<div class="flex gap-1.5" aria-busy="true" aria-label="Loading projects">
			{#each [0, 1, 2] as i (i)}
				<Skeleton class="h-8 w-24 shrink-0 rounded-md lg:h-9 lg:w-full lg:rounded-md" />
			{/each}
		</div>
	{:else}
		<div
			class="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
			role="group"
			aria-label="Filter by project"
		>
			<button
				type="button"
				aria-current={selectedId === null ? 'true' : undefined}
				onclick={() => onselect(null)}
				class="flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none lg:w-full lg:rounded-md {selectedId ===
				null
					? 'border-brand bg-accent text-foreground'
					: 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'}"
			>
				<span class="min-w-0 flex-1 truncate text-sm">All projects</span>
				<span class="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
					{totals.open}/{totals.tasks}
				</span>
			</button>

			{#each projects as project (project.id)}
				<div
					class="flex shrink-0 items-center gap-0.5 rounded-md border pr-0.5 transition-colors lg:w-full lg:rounded-md {selectedId ===
					project.id
						? 'border-brand bg-accent'
						: 'border-border hover:border-muted-foreground'}"
				>
					<button
						type="button"
						aria-current={selectedId === project.id ? 'true' : undefined}
						onclick={() => onselect(project.id)}
						class="flex min-w-0 items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none lg:flex-1 lg:rounded-md {selectedId ===
						project.id
							? 'text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						title="{project.openCount} open of {project.taskCount} tasks"
					>
						<span class="min-w-0 flex-1 truncate text-sm">{project.name}</span>
						<span class="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
							{project.openCount}/{project.taskCount}
						</span>
						<span
							class="shrink-0 font-mono text-[9px] tracking-wide uppercase {project.role === 'admin'
								? 'text-brand'
								: 'text-muted-foreground/60'}"
						>
							{project.role}
						</span>
						{#if project.completedAt}
							<span
								class="shrink-0 rounded-sm border border-dashed border-muted-foreground/40 px-1.5 py-0 font-mono text-[9px] text-muted-foreground/70"
							>
								completed
							</span>
						{/if}
					</button>
					{#if canManage && project.role === 'admin'}
						<button
							type="button"
							aria-label="Project settings for {project.name}"
							title="Project settings"
							class="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
							onclick={() => (settingsId = project.id)}
						>
							<MoreHorizontal class="size-3.5" aria-hidden="true" />
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if projects.length === 0 && !creating && !loading}
		<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
			no projects yet{canCreate ? ' — start one above' : ' — an admin can invite you to one'}
		</p>
	{/if}

	<label class="flex flex-col gap-1 lg:mt-auto">
		<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
			sort tasks
		</span>
		<Select.Root
			type="single"
			items={TASK_SORTS}
			value={sort}
			onValueChange={(next) => onsort(next as TaskSort)}
		>
			<Select.Trigger aria-label="Sort tasks" class="w-full justify-between">
				<Select.Value />
			</Select.Trigger>
			<Select.Content>
				{#each TASK_SORTS as option (option.value)}
					<Select.Item value={option.value} label={option.label} />
				{/each}
			</Select.Content>
		</Select.Root>
		<span class="font-mono text-[9px] text-muted-foreground/50"
			>presentation only — the view is lumen's</span
		>
	</label>
</aside>

{#if settingsProject}
	<ProjectSettingsDialog
		project={settingsProject}
		{viewerId}
		onClose={() => (settingsId = null)}
		{onChanged}
		onDeleted={projectDeleted}
	/>
{/if}
