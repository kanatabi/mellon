<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import { ListTodo, Plus, Search, X } from 'lucide-svelte';
	import { client, ApiError, errorText } from '#lib/api/client.ts';
	import type { Principal, TaskInvite, TaskItem, TaskView, TaskWorkspace } from '#lib/api/types.ts';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import InviteBanner from '#lib/components/tasks/InviteBanner.svelte';
	import NewTaskDialog from '#lib/components/tasks/NewTaskDialog.svelte';
	import ProjectSidebar from '#lib/components/tasks/ProjectSidebar.svelte';
	import TaskDrawer from '#lib/components/tasks/TaskDrawer.svelte';
	import TaskRow from '#lib/components/tasks/TaskRow.svelte';
	import TaskStatsRow from '#lib/components/tasks/TaskStatsRow.svelte';
	import { setPageCommands } from '#lib/page-commands.svelte.ts';
	import { taskCommands } from '#lib/tasks/commands.ts';
	import { flash } from '#lib/flash.svelte.ts';
	import {
		DEFAULT_TASK_SORT,
		filterTasks,
		groupTasksByProject,
		sortTasks,
		type TaskSort
	} from '#lib/tasks/list.ts';

	/**
	 * The tasks workspace — the app-center's first real application. All
	 * data rides client.* through the same-origin relay; the browser client
	 * already sends X-Client-Timezone, so every "today" here is lumen's
	 * answer in the reader's zone. The page is deliberately client-rendered
	 * (no server load): the layout gates auth, and a 403 or an empty
	 * membership must render as a quiet state, not a 500.
	 */
	const VIEWS: { id: TaskView; label: string }[] = [
		{ id: 'today', label: 'My day' },
		{ id: 'upcoming', label: 'Upcoming' },
		{ id: 'all', label: 'All' }
	];

	const principal = $derived((page.data.principal ?? null) as Principal | null);
	const held = (scope: string) => principal?.scopes?.includes(scope) ?? false;
	const canCreate = $derived(held('tasks:create'));
	const canUpdate = $derived(held('tasks:update'));
	const canManage = $derived(held('tasks:manage'));

	let view = $state<TaskView>('today');
	let projectId = $state<string | null>(null);
	let sort = $state<TaskSort>(DEFAULT_TASK_SORT);
	let query = $state('');
	let newProjectOpen = $state(false);

	let workspace = $state<TaskWorkspace | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let loadError = $state<string | null>(null);
	let loadStatus = $state<number | null>(null);
	let refreshError = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	const toggling = new SvelteSet<string>();
	let loadGen = 0;

	let invites = $state<TaskInvite[]>([]);
	let invitesLoadError = $state<string | null>(null);
	let inviteActionError = $state<string | null>(null);
	let inviteBusyId = $state<string | null>(null);
	let invitesGen = 0;

	let composerOpen = $state(false);
	let drawerId = $state<string | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	const projects = $derived(workspace?.projects ?? []);
	const tasks = $derived(workspace?.tasks ?? []);
	const trimmedQuery = $derived(query.trim());
	const selectedProject = $derived(projects.find((p) => p.id === projectId) ?? null);
	const adminProjectIds = $derived(
		projects.filter((project) => project.role === 'admin').map((project) => project.id)
	);
	const sortedTasks = $derived(sortTasks(tasks, sort));
	const visibleTasks = $derived(filterTasks(sortedTasks, trimmedQuery));
	const groups = $derived(groupTasksByProject(visibleTasks, projects));

	const emptyMessage = $derived.by(() => {
		if (trimmedQuery) return `nothing matches “${trimmedQuery}”`;
		if (selectedProject) return `nothing in ${selectedProject.name} for this view`;
		if (view === 'today') return 'nothing due today — the day is yours';
		if (view === 'upcoming') return 'nothing upcoming';
		return 'no tasks yet — create one to get started';
	});

	async function loadWorkspace(v: TaskView, p: string | null, silent = false) {
		const gen = ++loadGen;
		if (silent) refreshing = true;
		else {
			loading = true;
			loadError = null;
			loadStatus = null;
			refreshError = null;
		}
		try {
			const next = await client.tasksWorkspace({ view: v, projectId: p ?? undefined });
			if (gen !== loadGen) return;
			workspace = next;
			loadError = null;
			loadStatus = null;
			refreshError = null;
			// A selected project that vanished between reads is not a filter
			// with zero results — it is gone; return to the whole workspace.
			if (p && !next.projects.some((project) => project.id === p)) {
				projectId = null;
			}
		} catch (e) {
			if (gen !== loadGen) return;
			if (e instanceof ApiError && e.status === 404 && p) {
				flash({
					kind: 'warn',
					title: 'That project is gone',
					description: 'showing every project again'
				});
				projectId = null;
				return;
			}
			if (e instanceof ApiError && e.status === 403) {
				// A revoked scope is never papered over with stale data.
				loadError = errorText(e);
				loadStatus = 403;
			} else if (silent) {
				refreshError = errorText(e);
			} else {
				loadError = errorText(e);
				loadStatus = e instanceof ApiError ? e.status : null;
			}
		} finally {
			if (gen === loadGen) {
				loading = false;
				refreshing = false;
			}
		}
	}

	async function loadInvites() {
		const gen = ++invitesGen;
		try {
			const rows = await client.taskInvites();
			if (gen !== invitesGen) return;
			invites = rows;
			invitesLoadError = null;
		} catch (e) {
			if (gen !== invitesGen) return;
			invitesLoadError = errorText(e);
		}
	}

	$effect(() => {
		const v = view;
		const p = projectId;
		void loadWorkspace(v, p);
	});

	// A new view/project is a new list: the scroll container returns to the
	// top instead of stranding the reader halfway down yesterday's rows.
	// The local filter/sort are list-shaping too, so they count.
	$effect(() => {
		void view;
		void projectId;
		void trimmedQuery;
		void sort;
		if (listEl) listEl.scrollTop = 0;
	});

	// The bell's click-through carries /tasks?task=<id>. The route keeps this
	// component mounted across same-route query navigations, so the deep link
	// must be watched, not read once at mount. Closing the drawer clears the
	// param (closeDrawer), which re-arms the next notification for the same id.
	let seenTaskParam: string | null = null;
	$effect(() => {
		const linked = page.url.searchParams.get('task');
		if (linked && linked !== seenTaskParam) {
			seenTaskParam = linked;
			drawerId = linked;
		} else if (!linked) {
			seenTaskParam = null;
		}
	});

	// The palette's tasks verbs (DESIGN §7): registered while this page is the
	// mounted context, cleared on leave. The same store the editor uses — a
	// 403 panel registers nothing, and a scope-less account never sees a verb
	// it cannot run.
	$effect(() => {
		if (!principal || loadError || !workspace) {
			setPageCommands([]);
			return;
		}
		setPageCommands(
			taskCommands({
				view,
				projectId,
				sort,
				projects,
				tasks: visibleTasks,
				canCreate,
				inviteCount: invites.length,
				setView: (next) => (view = next),
				setProject: (next) => (projectId = next),
				setSort: (next) => (sort = next),
				openTask: (id) => (drawerId = id),
				newTask: () => (composerOpen = true),
				newProject: () => (newProjectOpen = true),
				reviewInvites: () =>
					document
						.getElementById('task-invites')
						?.scrollIntoView({ behavior: 'smooth', block: 'center' })
			})
		);
		return () => setPageCommands([]);
	});

	onMount(() => {
		void loadInvites();
	});

	function closeDrawer() {
		drawerId = null;
		// The bell's click-through lands on /tasks?task=…; closing the drawer
		// clears the claim so a reload does not resurrect a dismissed sheet.
		if (page.url.searchParams.has('task')) {
			const next = new URL(page.url.href);
			next.searchParams.delete('task');
			void replaceState(next, page.state);
		}
	}

	async function toggleTask(task: TaskItem) {
		if (!canUpdate || toggling.has(task.id)) return;
		actionError = null;
		toggling.add(task.id);
		try {
			await client.taskToggle(task.id);
			await loadWorkspace(view, projectId, true);
		} catch (e) {
			actionError = errorText(e);
		} finally {
			toggling.delete(task.id);
		}
	}

	async function acceptInvite(invite: TaskInvite) {
		if (inviteBusyId) return;
		inviteBusyId = invite.id;
		inviteActionError = null;
		try {
			const accepted = await client.taskInviteAccept(invite.id);
			flash({
				kind: 'ok',
				title: 'Invitation accepted',
				description: `${accepted.projectName} joined — its tasks are here now`
			});
			// Land in the new project; the view/project effect refetches.
			projectId = accepted.projectId;
			await loadInvites();
		} catch (e) {
			inviteActionError = errorText(e);
			// An expired invite is consumed by the failed accept — re-read the
			// inbox so the row that answered 410 does not linger.
			await loadInvites();
		} finally {
			inviteBusyId = null;
		}
	}

	async function declineInvite(invite: TaskInvite) {
		if (inviteBusyId) return;
		inviteBusyId = invite.id;
		inviteActionError = null;
		try {
			await client.taskInviteDecline(invite.id);
			flash({ kind: 'ok', title: 'Invitation declined' });
			await loadInvites();
		} catch (e) {
			inviteActionError = errorText(e);
			await loadInvites();
		} finally {
			inviteBusyId = null;
		}
	}

	function onProjectDeleted(id: string) {
		if (projectId === id) projectId = null;
		else void loadWorkspace(view, projectId, true);
		void loadInvites();
	}

	function onTaskCreated(task: TaskItem) {
		composerOpen = false;
		flash({
			kind: 'ok',
			title: 'Task created',
			description: `${task.title} — ${task.projectName}`
		});
		drawerId = task.id;
		void loadWorkspace(view, projectId, true);
	}
</script>

<svelte:head>
	<title>Tasks · mellon</title>
</svelte:head>

<section class="flex h-full min-h-0 flex-col gap-4">
	<header class="flex shrink-0 flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<h1 class="font-brand text-4xl font-semibold tracking-tight">Tasks</h1>
			<p class="font-mono text-xs text-muted-foreground">
				{#if loadError}
					the workspace is unavailable
				{:else if workspace}
					{projects.length}
					{projects.length === 1 ? 'project' : 'projects'} · the day boundary is lumen's, in your timezone
				{:else}
					reading the workspace…
				{/if}
			</p>
		</div>
		{#if canCreate && projects.length > 0}
			<Button
				type="button"
				variant="primary"
				class="gap-2 self-start md:self-auto"
				onclick={() => (composerOpen = true)}
			>
				<Plus class="size-4" aria-hidden="true" />
				New task
			</Button>
		{/if}
	</header>

	{#if !loadError && (invites.length > 0 || invitesLoadError || inviteActionError)}
		<div id="task-invites">
			<InviteBanner
				{invites}
				busyId={inviteBusyId}
				error={inviteActionError}
				loadError={invitesLoadError}
				onretry={() => void loadInvites()}
				onaccept={(invite) => void acceptInvite(invite)}
				ondecline={(invite) => void declineInvite(invite)}
			/>
		</div>
	{/if}

	{#if loadError}
		<div
			class="flex min-h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center"
		>
			<ListTodo class="size-5 text-muted-foreground/60" aria-hidden="true" />
			{#if loadStatus === 403}
				<p class="text-sm text-foreground">Tasks isn't open to this account.</p>
				<p class="max-w-md font-mono text-xs leading-relaxed break-words text-muted-foreground">
					{loadError}
				</p>
				<p class="max-w-md font-mono text-[10px] leading-relaxed text-muted-foreground/70">
					ask an administrator for any of tasks:create · tasks:update · tasks:manage — the workspace
					is lumen's to open
				</p>
			{:else}
				<p class="text-sm text-foreground">couldn't load tasks</p>
				<p class="max-w-md font-mono text-xs leading-relaxed break-words text-muted-foreground">
					{loadError}
				</p>
			{/if}
			<Button
				type="button"
				variant="quiet"
				class="px-3 py-1.5"
				onclick={() => void loadWorkspace(view, projectId)}
			>
				Try again
			</Button>
		</div>
	{:else}
		<TaskStatsRow stats={workspace?.stats ?? null} loading={loading && workspace === null} />

		<div class="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
			<ProjectSidebar
				{projects}
				selectedId={projectId}
				{sort}
				bind:creating={newProjectOpen}
				loading={loading && workspace === null}
				{canCreate}
				{canManage}
				viewerId={principal?.id ?? ''}
				onselect={(id) => (projectId = id)}
				onsort={(next) => (sort = next)}
				onChanged={() => void loadWorkspace(view, projectId, true)}
				onDeleted={onProjectDeleted}
			/>

			<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
				<div class="flex shrink-0 flex-wrap items-center gap-2">
					<div
						class="flex rounded-md border border-border bg-muted p-0.5"
						role="group"
						aria-label="Task view"
					>
						{#each VIEWS as option (option.id)}
							<button
								type="button"
								onclick={() => (view = option.id)}
								aria-pressed={view === option.id}
								class="rounded-sm px-3 py-1 font-mono text-xs transition-colors {view === option.id
									? 'bg-card text-foreground ring-1 ring-border'
									: 'text-muted-foreground hover:text-foreground'}"
							>
								{option.label}
							</button>
						{/each}
					</div>

					<div class="relative min-w-40 flex-1">
						<Search
							class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60"
							aria-hidden="true"
						/>
						<Input
							type="search"
							bind:value={query}
							aria-label="Filter the loaded tasks"
							placeholder="filter the loaded tasks"
							autocomplete="off"
							class="w-full py-1.5 pr-8 pl-8 text-xs placeholder:text-muted-foreground/60"
						/>
						{#if query}
							<Button
								type="button"
								variant="soft"
								class="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center"
								aria-label="Clear the task filter"
								title="Clear filter"
								onclick={() => (query = '')}
							>
								<X class="size-3.5" aria-hidden="true" />
							</Button>
						{/if}
					</div>

					{#if trimmedQuery && workspace}
						<span class="font-mono text-[10px] text-muted-foreground">
							{visibleTasks.length} of {tasks.length}
						</span>
					{/if}
					{#if refreshing || (loading && workspace !== null)}
						<span
							class="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
						>
							<Spinner class="size-3" aria-label="Refreshing tasks" />
							updating
						</span>
					{/if}
				</div>

				{#if refreshError}
					<p class="font-mono text-[11px] break-words text-muted-foreground" role="status">
						couldn't refresh — {refreshError} · the list below is the last good read
					</p>
				{/if}
				{#if actionError}
					<p class="font-mono text-[11px] break-words text-danger" role="alert">{actionError}</p>
				{/if}

				<div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
					{#if loading && workspace === null}
						<div
							class="flex flex-col gap-3 py-1"
							role="status"
							aria-busy="true"
							aria-label="Loading tasks"
						>
							{#each [0, 1, 2] as group (group)}
								<div class="flex flex-col gap-2">
									<Skeleton class="h-4 w-32" />
									<Skeleton class="h-10 w-full" />
									<Skeleton class="h-10 w-full" />
								</div>
							{/each}
						</div>
					{:else if projects.length === 0}
						<div
							class="flex min-h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center"
						>
							<ListTodo class="size-5 text-muted-foreground/60" aria-hidden="true" />
							<div>
								<p class="text-sm text-foreground">No projects yet.</p>
								<p class="mt-1 max-w-md font-mono text-xs leading-relaxed text-muted-foreground">
									{canCreate
										? canManage
											? 'create the first project — then invite the people who share the work.'
											: 'create the first project — tasks live inside it.'
										: 'nothing has been shared with you yet — ask a project admin for an invite.'}
								</p>
							</div>
							{#if canCreate}
								<Button
									type="button"
									variant="primary"
									class="gap-1.5"
									onclick={() => (newProjectOpen = true)}
								>
									<Plus class="size-3.5" aria-hidden="true" />
									New project
								</Button>
							{/if}
						</div>
					{:else if groups.length === 0}
						<div
							class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center"
						>
							<p class="font-mono text-sm text-muted-foreground">{emptyMessage}</p>
							{#if canCreate && !trimmedQuery}
								<Button
									type="button"
									variant="quiet"
									class="gap-1.5 px-3 py-1.5"
									onclick={() => (composerOpen = true)}
								>
									<Plus class="size-3.5" aria-hidden="true" />
									New task
								</Button>
							{/if}
						</div>
					{:else}
						{#each groups as group (group.projectId)}
							<section class="mb-4 last:mb-0" aria-label={group.projectName}>
								<div
									class="sticky top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur"
								>
									<h2 class="font-brand text-base font-semibold tracking-tight">
										{group.projectName}
									</h2>
									{#if group.completed}
										<span
											class="rounded-sm border border-dashed border-muted-foreground/40 px-1.5 py-0 font-mono text-[9px] text-muted-foreground/70"
										>
											completed
										</span>
									{/if}
									<span class="font-mono text-[10px] text-muted-foreground">
										{group.tasks.filter((task) => !task.done).length} open · {group.tasks.length}
									</span>
								</div>
								<div class="flex flex-col">
									{#each group.tasks as task (task.id)}
										<TaskRow
											{task}
											busy={toggling.has(task.id)}
											canEdit={canUpdate}
											onopen={() => (drawerId = task.id)}
											ontoggle={() => void toggleTask(task)}
										/>
									{/each}
								</div>
							</section>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</section>

{#if composerOpen && projects.length > 0}
	<NewTaskDialog
		{projects}
		initialProjectId={projectId}
		onClose={() => (composerOpen = false)}
		onCreated={onTaskCreated}
	/>
{/if}

<TaskDrawer
	taskId={drawerId}
	canEdit={canUpdate}
	{adminProjectIds}
	viewerId={principal?.id ?? ''}
	onClose={closeDrawer}
	onChanged={() => void loadWorkspace(view, projectId, true)}
/>
