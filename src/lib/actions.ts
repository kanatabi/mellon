/**
 * DOM actions (vendored pattern from earendil's actions.ts — same lessons).
 */

/**
 * Focuses the node on mount. The `autofocus` attribute is unreliable here:
 * browsers only honor it for the initial page render, not dynamically mounted
 * dialogs (Svelte inserts them after load).
 */
export function focusOnMount(node: HTMLElement) {
	node.focus();
}
