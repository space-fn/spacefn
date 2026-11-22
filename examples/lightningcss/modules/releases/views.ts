import { html } from "spacefn";

import type { Release } from "./releases.ts";

/** The releases, newest first, each with its notes. */
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

/** The page's body: the heading, then the releases. */
export const releasesPage = (props: { readonly releases: readonly Release[] }) =>
	html`<main>
		<h1>Release notes</h1>
		${releaseList(props)}
	</main>`;
