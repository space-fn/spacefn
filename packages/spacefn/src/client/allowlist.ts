import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Plugin } from "vite";

/**
 * Vite plugin enforcing the `app/client/` import allowlist transitively.
 * Only `app/client/`, `modules/`, `utils/`, `lib/` and npm packages may be
 * pulled into a client bundle. Everything else (including `app/env.ts`) fails
 * the build.
 */
export function clientAllowlistPlugin(root: string): Plugin {
	const realRoot = (() => {
		try {
			return realpathSync(root);
		} catch {
			return resolve(root);
		}
	})();
	const allowed = [
		join(realRoot, "app", "client"),
		join(realRoot, "modules"),
		join(realRoot, "utils"),
		join(realRoot, "lib"),
	];
	return {
		name: "space-client-allowlist",
		enforce: "pre",
		async resolveId(source, importer) {
			const resolved = await this.resolve(source, importer, { skipSelf: true });
			if (!resolved) return null;
			const id = resolved.id;
			if (id.startsWith("\0")) return resolved;
			if (id.includes("node_modules")) return resolved;
			if (id.startsWith("node:")) {
				this.error(`Node built-in "${source}" is not allowed in app/client code.`);
			}
			let realId = id;
			try {
				realId = realpathSync(id);
			} catch {
				realId = resolve(id);
			}
			const ok = allowed.some((root) => realId === root || realId.startsWith(root + "/"));
			if (!ok) {
				this.error(
					`Import not allowed in app/client code: "${source}" resolved to "${id}". ` +
						"Allowed roots: app/client/, modules/, utils/, lib/, npm packages.",
				);
			}
			return resolved;
		},
	};
}
