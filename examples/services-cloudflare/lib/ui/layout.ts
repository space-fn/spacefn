import { html, type HtmlValue } from "spacefn";
import { assets } from "spacefn/assets";

export const layout = (body: HtmlValue) =>
	html`<html>
		<head>
			${assets("main")}
		</head>
		<body>
			${body}
		</body>
	</html>`;
