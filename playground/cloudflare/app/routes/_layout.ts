import { html, type HtmlValue } from "spacefn";
// Files starting with _ are private: no page is made from this one.
import { head } from "spacefn/assets";

/** Datastar's client, for live updates. Or install it and import it from app/client/. */
const DATASTAR = "https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.5/bundles/datastar.js";

export const layout = (title: string, body: HtmlValue) =>
	html`<!doctype html>
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>${title}</title>
				${head}
				<script type="module" src="${DATASTAR}"></script>
			</head>
			<body>
				${body}
			</body>
		</html>`;
