import { html, type HtmlValue } from "spacefn";
import { assets } from "spacefn/assets";

/**
 * Datastar with Rocket, from the CDN: the bundle includes Datastar, so it loads
 * in place of datastar.js. app/client/main.ts imports the same URL for `rocket`,
 * and the browser runs it once.
 */
const DATASTAR =
	"https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.5/bundles/datastar-rocket.js";

/** The HTML around every page: its title, the site's styles, Datastar and the client entry. */
export const layout = (title: string, body: HtmlValue) =>
	html`<!doctype html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>${title}</title>
				${assets("site")}
				<script type="module" src="${DATASTAR}"></script>
				${assets("main")}
			</head>
			<body>
				${body}
			</body>
		</html>`;
