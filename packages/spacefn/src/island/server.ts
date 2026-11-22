import { escapeHtml, html, once, raw } from "../html.ts";
import type { Island, IslandStart } from "../island.ts";

/** The JSON for a `<script>`: `<` escaped, so no string in it can close the script. */
const scriptJson = (value: unknown) => (JSON.stringify(value) ?? "null").replaceAll("<", "\\u003c");

/**
 * `island(...)` on the server, given its file's tags: `render` writes the
 * element and its props, then each tag through `once`, so a page loads the
 * file once however many of them it has.
 */
export const serverIsland = (tags: readonly string[]) => {
	const scripts = tags.map((tag) => once(raw(tag)));
	return <P>(name: string, _start: IslandStart<P> | null): Island<P> => {
		const open = `<spacefn-island name="${escapeHtml(name)}" style="display: contents">`;
		return {
			name,
			// A string, not an html template, so formatting the file can't add whitespace to it.
			render: (props) =>
				html`${raw(`${open}<script type="application/json">${scriptJson(props)}</script></spacefn-island>`)}${scripts}`,
		};
	};
};
