/**
 * The `<script>` and `<link>` tags for the `app/client/` entries: the source
 * files in dev, the hashed build files in a build. Put it in `<head>`.
 *
 * ```ts
 * import { head } from "spacefn/assets";
 * ```
 *
 * The spacefn Vite plugin (`configs/vite.ts`) replaces this module with the
 * app's own tags, so this file only runs when the plugin is missing.
 */
import type { Html } from "./html.ts";

const missing = (): never => {
	throw new Error(
		'spacefn/assets is provided by the spacefn Vite plugin: add plugins: [space(...)] from "spacefn/vite" to the Vite config',
	);
};

export const head: Html = new Proxy({} as Html, { get: missing });
