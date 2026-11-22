// What TypeScript sees of a .vue file: Vite compiles it, tsc doesn't read it.
// For checked templates and island props, run vue-tsc instead of tsc.
declare module "*.vue" {
	import type { DefineComponent } from "vue";

	const component: DefineComponent<any, any, any>;
	export default component;
}
