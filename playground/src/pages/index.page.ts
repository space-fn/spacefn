import { defineComponent, h } from "@spacefn/html";
import type { LoaderReturnType } from "@spacefn/server";
import type { loader } from "./index.server";
import { cardSx, btnSx, cssOutput } from "../styles";

type Props = LoaderReturnType<typeof loader>;

export default defineComponent<Props>((props) => {
	return h.html(
		{},
		h.head({}, h.style({}, cssOutput)),
		h.body(
			{},
			h.main(
				{},
				h.h1({}, props.msg),
				h.p({}, "Welcome to your Space app"),
				h.div(
					{ class: cardSx.base },
					h.h2({ class: cardSx.heading }, "Card Title"),
					h.p({ class: cardSx.content }, "This card uses @spacefn/css tokens and variants."),
					h.button({ class: btnSx({ color: "primary" }).base }, "Primary"),
					h.button({ class: btnSx({ color: "danger" }).base }, "Danger"),
				),
			),
		),
	);
});
