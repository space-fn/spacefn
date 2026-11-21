import { html } from "spacefn";

/**
 * Where a client component mounts: an element with its `id` and its props as
 * JSON. The server renders it, and a client entry starts the component in it
 * with `mountIsland(id, ...)` from `mount.ts`.
 */
export const island = (id: string, props: unknown) =>
	html`<div id="${id}" data-props="${JSON.stringify(props)}"></div>`;
