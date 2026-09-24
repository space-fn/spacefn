import { defineComponent, h } from "@spacefn/html";
import type { LoaderReturnType } from "@spacefn/server";

import type { loader } from "./index.server";

type Props = LoaderReturnType<typeof loader>;

export default defineComponent<Props>((props) => {
	return h.main({}, h.h1({}, props.msg), h.p({}, "Welcome to your Space app"));
});
