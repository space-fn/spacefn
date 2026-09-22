import { defineComponent, h } from "@spacefn/html";

type Props = {
	msg: string;
};

export default defineComponent<Props>((props) => {
	return h.main({}, h.h1({}, props.msg), h.p({}, "Welcome to your Space app"));
});
