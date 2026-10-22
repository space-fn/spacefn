import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { build } from "vite";

import { clientAllowlistPlugin } from "./allowlist";

export type ClientManifestMap = Record<string, { js?: string; css?: string[] }>;

/**
 * Runs a Vite build of the `app/client/` entries into `<assets>/_client/`,
 * enforcing the import allowlist. Returns the entry -> hashed URL map.
 */
export async function runClientBuild(
	root: string,
	entries: string[],
	builder: any,
	clientConfig: Record<string, unknown> = {},
): Promise<ClientManifestMap> {
	const assetsDir = resolve(builder.config.root, builder.config.environments.client.build.outDir);
	const outDir = join(assetsDir, "_client");
	await mkdir(outDir, { recursive: true });

	const input: Record<string, string> = {};
	const keyToEntry: Record<string, string> = {};
	for (const entry of entries) {
		const key = entry.replace(/\.[^.]+$/, "");
		input[key] = join(root, "app", "client", entry);
		keyToEntry[key] = entry;
	}

	const userBuild = (clientConfig.build as Record<string, unknown>) ?? {};
	const userRolldown = (userBuild.rolldownOptions as Record<string, unknown>) ?? {};
	const result = await build({
		configFile: false,
		root,
		...clientConfig,
		resolve: {
			alias: builder.config.resolve?.alias as never,
			...((clientConfig.resolve as Record<string, unknown>) ?? {}),
		},
		plugins: [...((clientConfig.plugins as any[]) ?? []), clientAllowlistPlugin(root)],
		build: {
			outDir,
			emptyOutDir: true,
			...userBuild,
			rolldownOptions: {
				...userRolldown,
				input,
				output: {
					entryFileNames: "[name]-[hash].js",
					chunkFileNames: "chunks/[name]-[hash].js",
					assetFileNames: "[name]-[hash][extname]",
					...((userRolldown.output as Record<string, unknown>) ?? {}),
				},
			},
			manifest: false,
			write: true,
		},
		logLevel: "warn",
	});

	const outputs = Array.isArray(result)
		? result.flatMap((r: { output?: unknown[] }) => r.output ?? [])
		: ((result as { output?: unknown[] }).output ?? []);

	const manifest: ClientManifestMap = {};
	for (const entry of entries) manifest[entry] = {};

	for (const o of outputs as Array<{
		type: string;
		name?: string;
		fileName?: string;
		isEntry?: boolean;
		viteMetadata?: { importedCss?: Set<string> };
	}>) {
		if (!o.name) continue;
		const entry = keyToEntry[o.name] ?? (entries.includes(o.name) ? o.name : undefined);
		if (!entry || !manifest[entry]) continue;
		if (o.type === "chunk" && o.isEntry) {
			manifest[entry]!.js = `/_client/${o.fileName}`;
			const css = o.viteMetadata?.importedCss;
			if (css && css.size) manifest[entry]!.css = [...css].map((f) => `/_client/${f}`);
		} else if (o.type === "asset" && String(o.fileName).endsWith(".css")) {
			manifest[entry]!.css = manifest[entry]!.css ?? [];
			manifest[entry]!.css!.push(`/_client/${o.fileName}`);
		}
	}

	for (const entry of entries) {
		if (!manifest[entry]?.js && !manifest[entry]?.css?.length) {
			throw new Error(`Client build produced no output for entry "${entry}".`);
		}
	}

	return manifest;
}
