import { html, type HtmlValue } from "spacefn";
import { assets } from "spacefn/assets";

/**
 * The HTML around every page: its title and the site's styles. A page that
 * needs more passes its tags as `head`.
 */
export const layout = (title: string, body: HtmlValue, head: HtmlValue = "") =>
	html`<!doctype html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>${title}</title>
				${assets("site")} ${head}
			</head>
			<body>
				<nav><a href="/">Shop</a> · <a href="/about">About</a></nav>
				${body}
			</body>
		</html>`;
