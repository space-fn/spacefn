import { escapeHtml, html, once, raw, type Html } from "../html.ts";

/** The JSON for a `<script>`: `<` escaped, so no string in it can close the script. */
const scriptJson = (value: unknown) => (JSON.stringify(value) ?? "null").replaceAll("<", "\\u003c");

/**
 * `island(name, props)` on the server, given each island's tags: the element
 * and its props, then each tag through `once`, so a page loads an island's
 * script once however many of it the page has.
 */
export const islandsOf = (tagsOf: (name: string) => readonly string[] | undefined) => {
	const cache = new Map<string, Html[]>();
	return (name: string, props?: unknown): Html => {
		let scripts = cache.get(name);
		if (!scripts) {
			const tags = tagsOf(name);
			if (!tags)
				throw new Error(`spacefn: there's no island "${name}"; an island is a *.island.* file`);
			scripts = tags.map((tag) => once(raw(tag)));
			cache.set(name, scripts);
		}
		const open = `<spacefn-island name="${escapeHtml(name)}" style="display: contents">`;
		// A string, not an html template, so formatting the file can't add whitespace to it.
		return html`${raw(`${open}<script type="application/json">${scriptJson(props)}</script></spacefn-island>`)}${scripts}`;
	};
};
