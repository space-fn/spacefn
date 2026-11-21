import { html, raw } from "spacefn";

/**
 * Where a client component mounts: an empty element with its `id`, and its
 * props as JSON in a script beside it. The server renders it, and a client
 * entry starts the component in it with `mountIsland(id, ...)` from `mount.ts`.
 * `<` is escaped so no string in the props can close the script.
 */
export const island = (id: string, props: unknown) =>
	html`<div id="${id}"></div>
		<script type="application/json" id="${id}-props">
			${raw(JSON.stringify(props).replaceAll("<", "\\u003c"))}
		</script>`;
