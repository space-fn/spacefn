import { html } from "spacefn";

import type { Release } from "./releases.ts";

export const releaseList = (props: { readonly releases: readonly Release[] }) =>
	html`<ol class="releases">
		${props.releases.map(
			(release) =>
				html`<li>
					<h2>${release.version}</h2>
					<time datetime="${release.date}">${release.date}</time>
					<ul>
						${release.notes.map((note) => html`<li>${note}</li>`)}
					</ul>
				</li>`,
		)}
	</ol>`;
