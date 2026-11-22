import { html, type HtmlValue } from "spacefn";
import { assets } from "spacefn/assets";

/** The HTML around every page: its title, the site's styles and the links between pages. */
export const layout = (title: string, body: HtmlValue) =>
	html`<!doctype html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>${title}</title>
				${assets("site")}
			</head>
			<body>
				<nav><a href="/">Shop</a> · <a href="/about">About</a></nav>
				${body}
			</body>
		</html>`;
