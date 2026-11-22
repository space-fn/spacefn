import { html } from "spacefn";

/** The about page's body: plain server-rendered HTML, with no island. */
export const aboutPage = () =>
	html`<main>
		<h1>About</h1>
		<p>This page is plain server-rendered HTML: it loads the site's styles, and not the cart.</p>
	</main>`;
