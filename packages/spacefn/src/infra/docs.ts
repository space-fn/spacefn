// The docs reader comes from spacefn-docs, an app's optional dev dependency, so
// spacefn itself never installs Shiki and the docs.
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { addCommand, detectPackageManager } from "./package-manager.ts";
import { spacefnDir } from "./process.ts";

export const DOCS_PACKAGE = "spacefn-docs";

/** Where `space dev` serves the reader. */
export const DOCS_BASE = "/__space/docs/";

/** What spacefn uses of spacefn-docs. */
export interface DocsModule {
	readonly version: string;
	readonly appDocs: (options: { readonly root: string; readonly base: string }) => {
		readonly handle: (
			req: IncomingMessage,
			res: ServerResponse,
			next?: () => void,
		) => Promise<void>;
		readonly close: () => void;
	};
	readonly serve: (options: {
		readonly root: string;
		readonly port?: number;
		readonly host?: string;
	}) => Promise<{ readonly url: string; readonly close: () => Promise<void> }>;
}

export const spacefnVersion = (): string =>
	(JSON.parse(readFileSync(join(spacefnDir(), "package.json"), "utf8")) as { version: string })
		.version;

/** spacefn-docs as the app at `root` has it installed, if it does. */
export const loadDocs = async (root: string): Promise<DocsModule | undefined> => {
	let entry: string;
	try {
		entry = createRequire(join(root, "noop.js")).resolve(DOCS_PACKAGE);
	} catch {
		return undefined;
	}
	return (await import(pathToFileURL(entry).href)) as DocsModule;
};

/** The command that installs the docs for this spacefn. */
export const installDocs = (root: string): string =>
	addCommand(detectPackageManager(root), [`${DOCS_PACKAGE}@${spacefnVersion()}`], true).join(" ");

/** A note when the installed docs describe another spacefn version. */
export const docsMismatch = (docs: DocsModule): string | undefined => {
	const spacefn = spacefnVersion();
	return docs.version === spacefn
		? undefined
		: `${DOCS_PACKAGE} ${docs.version} describes another spacefn than ${spacefn}; space upgrade updates both`;
};
