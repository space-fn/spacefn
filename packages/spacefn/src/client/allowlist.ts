import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Plugin } from "vite";

/**
 * Vite plugin enforcing the `app/client/` import allowlist transitively.
 * Only `app/client/`, `modules/`, `utils/`, `lib/` and npm packages may be
 * pulled into a client bundle. Everything else (including `app/env.ts`) fails
 * the build.
 */
const BANNED_SCHEMES = ["node:", "cloudflare:"];

export function isAllowedClientImport(root: string, id: string): { ok: boolean; reason?: string } {
	let realId = id;
	try {
		realId = realpathSync(id);
	} catch {
		realId = resolve(id);
	}
	if (BANNED_SCHEMES.some((s) => realId.startsWith(s) || id.startsWith(s))) {
		return { ok: false, reason: `banned scheme in "${id}"` };
	}
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
	if (realId.includes("node_modules")) return { ok: true };
	const ok = allowed.some((r) => realId === r || realId.startsWith(r + "/"));
	if (!ok) return { ok: false, reason: `not in allowed roots: ${id}` };
	return { ok: true };
}

export function clientAllowlistPlugin(root: string): Plugin {
	return {
		name: "space-client-allowlist",
		enforce: "pre",
		async resolveId(source, importer) {
			const resolved = await this.resolve(source, importer, { skipSelf: true });
			if (!resolved) return null;
			const id = resolved.id;
			if (id.startsWith("\0")) return resolved;
			if (id.includes("node_modules")) return resolved;
			const check = isAllowedClientImport(root, id);
			if (!check.ok) {
				this.error(
					`Import not allowed in app/client code: "${source}" resolved to "${id}". ` +
						(check.reason ?? "") +
						" Allowed roots: app/client/, modules/, utils/, lib/, npm packages.",
				);
			}
			return resolved;
		},
	};
}
