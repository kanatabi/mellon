<!-- Test fixture: the real AppSidebar inside its required Provider/Root
	context, with the $app/state module stubbed (see testing/app-state-stub). -->
<script lang="ts">
	import { FileText, House } from 'lucide-svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import AppSidebar from '../../../../routes/(app)/app-sidebar.svelte';

	const groups = [
		{
			label: 'Content',
			items: [
				{ href: '/', icon: House, label: 'Dashboard', hue: 'var(--brand)' },
				{ href: '/posts', icon: FileText, label: 'Posts', hue: 'var(--accent-blue)' }
			]
		}
	];
</script>

<Sidebar.Provider>
	<Sidebar.Root collapsible="icon">
		<AppSidebar {groups} />
	</Sidebar.Root>
</Sidebar.Provider>
