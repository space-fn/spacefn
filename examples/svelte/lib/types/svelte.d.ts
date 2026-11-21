// What TypeScript sees of a .svelte file: Vite compiles it, tsc doesn't read it.
// For checked components, run svelte-check instead of tsc.
declare module "*.svelte" {
	import type { Component } from "svelte";

	const component: Component<any>;
	export default component;
}
