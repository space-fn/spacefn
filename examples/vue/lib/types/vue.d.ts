// What TypeScript sees of a .vue file: Vite compiles it, tsc doesn't read it.
// For checked templates, run vue-tsc instead of tsc.
declare module "*.vue" {
	import type { DefineComponent } from "vue";

	const component: DefineComponent<object, object, unknown>;
	export default component;
}
