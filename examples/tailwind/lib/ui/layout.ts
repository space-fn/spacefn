import { html, type HtmlValue } from "spacefn";
import { assets } from "spacefn/assets";

/** Datastar's client, for the live search. */
const DATASTAR = "https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.5/bundles/datastar.js";

/** The HTML around every page: its title, the site's styles and Datastar. */
export const layout = (title: string, body: HtmlValue) =>
	html`<!doctype html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>${title}</title>
				${assets("site")}
				<script type="module" src="${DATASTAR}"></script>
			</head>
			<body class="font-display bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
				${body}
			</body>
		</html>`;
