import { svelteTesting } from '@testing-library/svelte/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Two projects, deliberately split by FILENAME so the existing suite is not
// perturbed by the DOM upgrade (SHADCN-PLAN.md S1 / R7):
//
//   *.test.ts      → `node`  — the 157-test fleet. Pure logic, no DOM, no
//                              Svelte compiler. Unchanged env, unchanged speed.
//   *.dom.test.ts  → `dom`   — component tests for `ui/`. happy-dom + the
//                              svelte plugin + testing-library's auto-cleanup.
//
// A component test that forgets the `.dom.` suffix fails loudly on `document`
// rather than silently running against an absent DOM.
export default defineConfig({
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					environment: 'node',
					include: ['src/**/*.{test,spec}.ts'],
					exclude: ['src/**/*.dom.test.ts']
				}
			},
			{
				extends: true,
				resolve: {
					alias: {
						// AppSidebar (and anything else reading SvelteKit state) gets a
						// stub in component tests — the dom project loads no SvelteKit
						// plugins by design (SHADCN-PLAN 1.6).
						'$app/state': '/src/lib/testing/app-state-stub.ts',
						'$app/env': '/src/lib/testing/app-state-stub.ts',
						'$app/navigation': '/src/lib/testing/app-state-stub.ts',
						'$app/forms': '/src/lib/testing/app-state-stub.ts'
					}
				},
				plugins: [
					// Mirror the app's compilerOptions (vite.config.ts): the project is
					// forced-runes, and a test that compiles in legacy mode would be
					// testing a component nobody ships. Same node_modules exclusion, so
					// vendored `ui/` is forced but bits-ui keeps its own build.
					svelte({
						// This repo has NO svelte.config.js on purpose (config lives in
						// vite.config.ts). Without this the plugin logs "no Svelte config
						// found" on every run and silently applies its own defaults.
						configFile: false,
						compilerOptions: {
							runes: ({ filename }) =>
								filename.split(/[/\\]/).includes('node_modules') ? undefined : true
						}
					}),
					svelteTesting()
				],
				test: {
					name: 'dom',
					environment: 'happy-dom',
					include: ['src/**/*.dom.test.ts'],
					// Component tests mount into a real document; isolation is per-file
					// so a leaked `document` listener cannot poison the next file.
					isolate: true
				}
			}
		]
	}
});
