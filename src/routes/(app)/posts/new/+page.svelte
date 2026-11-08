<script lang="ts">
	import { goto } from '$app/navigation';
	import { ApiError, client } from '#lib/api/client.ts';
	import { slugify } from '#lib/slug.ts';

	let title = $state('');
	let slug = $state('');
	let slugTouched = false;
	let error_ = $state('');

	$effect(() => {
		if (!slugTouched) slug = slugify(title);
	});

	const STARTER = `# ${'{title}'}

One paragraph that earns its keep.


\`\`\`mermaid
flowchart LR
    idea --> draft --> publish
\`\`\`
`;

	async function create() {
		error_ = '';
		if (!slug) {
			error_ = 'slug cannot be empty;';
			return;
		}
		try {
			const p = await client.createPost({
				slug,
				title: title || 'Untitled',
				subtitle: '',
				preview: '',
				date: new Date().toISOString().slice(0, 10),
				tags: [],
				content: STARTER.replace('{title}', title || 'Untitled'),
				thumbnail: null
			});
			goto(`/posts/${p.slug}`);
		} catch (e) {
			error_ = e instanceof ApiError ? e.message : 'could not create';
		}
	}
</script>

<svelte:head>
	<title>new post · mellon;</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-xl flex-col gap-4 py-8">
	<h1 class="font-brand text-3xl font-semibold tracking-tight">
		New post<span class="text-brand">;</span>
	</h1>
	<label class="flex flex-col gap-1">
		<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase">title</span>
		<input
			class="rounded-lg border-border bg-card px-3 py-2 text-sm outline-none focus-visible:border-brand"
			bind:value={title}
		/>
	</label>
	<label class="flex flex-col gap-1">
		<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase">slug</span>
		<input
			class="rounded-lg border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
			bind:value={slug}
			oninput={() => (slugTouched = true)}
		/>
	</label>
	{#if error_}
		<p class="font-mono text-xs text-danger" role="alert">{error_}</p>
	{/if}
	<div class="flex gap-2">
		<button
			type="button"
			onclick={() => void create()}
			class="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
		>
			create draft<span class="text-white/70">;</span>
		</button>
		<a
			href="/posts"
			class="flex items-center rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			cancel;
		</a>
	</div>
</section>
