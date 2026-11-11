import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// The markdown-it stack (preview render path) must BUNDLE into build/, not
	// externalize to node_modules: the adapter-node runtime stage is a self-
	// contained image with NO node_modules — vite's default SSR externalization
	// made every /api/* request die at runtime with ERR_MODULE_NOT_FOUND while
	// dev (vite) and the harness (vite dev) were blind to it. Live catch 2026-11-11.
	ssr: {
		noExternal: [
			'markdown-it',
			// shiki is the transitive core of @shikijs/markdown-it — externalize it and
			// the bundled render.js dies at runtime (live: Cannot find package 'shiki')
			'shiki',
			'@shikijs/types',
			'isomorphic-dompurify',
			'markdown-it-anchor',
			'markdown-it-container',
			'markdown-it-task-lists',
			'@shikijs/markdown-it'
		]
	},
	server: {
		// Same tunnel habit as earendil: ngrok hands out a fresh hostname per
		// session, so match by suffix. Extra hosts: ALLOWED_HOSTS=h1,h2.
		// (mellon is port-forward-first per the access doctrine — but LAN/tunnel
		// dev is how a private portal still gets checked on a real phone.)
		allowedHosts: [
			'.ngrok-free.app',
			'.ngrok.app',
			...(process.env.ALLOWED_HOSTS?.split(',')
				.map((h) => h.trim())
				.filter(Boolean) ?? [])
		]
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node build/ is the self-contained SSR server for the cluster
			// deploy. Amended 2026-11-08: console.gofar.id IS a sanctioned public
			// surface (TLS + GATE #10). Consequence for origin reconstruction: the
			// Deployment sets PROTOCOL_HEADER=x-forwarded-proto + HOST_HEADER=x-forwarded-host
			// (adapter-node's opt-in env knobs; default protocol is 'https', which would
			// break CSRF AND cookie derivation on plain-http local runs).
			adapter: adapter({ out: 'build' })
		})
	]
});
