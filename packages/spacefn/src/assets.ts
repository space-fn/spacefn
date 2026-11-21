/**
 * The `<script>` and `<link>` tags of `app/client/` entries, by name: the
 * source files in dev, the hashed build files (with their CSS and preloads)
 * in a build. Put them in `<head>`, in the order they should load.
 *
 * ```ts
 * import { assets } from "spacefn/assets";
 *
 * html`<head>${assets("site", "main")}</head>`;
 * ```
 *
 * The spacefn Vite plugin (`configs/vite.ts`) replaces this module with the
 * app's own tags, so this file only runs when the plugin is missing.
 */
import type { Html } from "./html.ts";

/**
 * The app's client entries, by name: `app/client/main.ts` is `main`.
 * `.space/assets.d.ts` lists them, so a name that isn't one is a type error.
 */
export interface ClientEntries {}

/** The name of a file in `app/client/`, without its extension. */
export type ClientEntry = Extract<keyof ClientEntries, string>;

export const assets = (..._names: [ClientEntry, ...ClientEntry[]]): Html => {
	throw new Error(
		'spacefn/assets is provided by the spacefn Vite plugin: add plugins: [space(...)] from "spacefn/vite" to the Vite config',
	);
};
