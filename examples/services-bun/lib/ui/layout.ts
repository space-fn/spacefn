import { html, type HtmlValue } from "spacefn";
import { assets } from "spacefn/assets";

export const layout = (body: HtmlValue) =>
	html`<!doctype html>
		<html>
			<head>
				${assets("style", "main")}
			</head>
			<body>
				${body}
			</body>
		</html>`;
