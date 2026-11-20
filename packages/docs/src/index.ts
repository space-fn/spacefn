// spacefn-docs: spacefn's docs, and the reader `space docs` and `space dev` show them with.
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createReader, type DocsSource, type Reader } from "./reader.ts";

export { createReader, type DocsSource, type Reader, type ReaderOptions } from "./reader.ts";
export { renderMarkdown, type Rendered, type TocEntry } from "./markdown.ts";

/** spacefn's own docs, as installed. */
export const contentDir: string = fileURLToPath(new URL("../content/", import.meta.url));

const manifest = (dir: string): { name?: string; version?: string } => {
	try {
		return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	} catch {
		return {};
	}
};

/** The installed version, which matches the spacefn it documents. */
export const version: string =
	manifest(fileURLToPath(new URL("..", import.meta.url))).version ?? "0.0.0";

const REPO = "https://github.com/space-fn/spacefn/blob/main/packages/docs/content/";

/** spacefn's docs. From node_modules, "Edit" goes to GitHub; in the spacefn repo, to your editor. */
export const spacefnSource = (prefix: string): DocsSource => ({
	label: "spacefn",
	dir: contentDir,
	prefix,
	version,
	...(contentDir.includes(`${sep}node_modules${sep}`)
		? { editUrl: (rel: string) => REPO + rel }
		: {}),
});

export interface AppDocsOptions {
	/** The app root: its `docs/` folder is served first, spacefn's docs under `spacefn/`. */
	readonly root: string;
	/** Where the reader is served, e.g. `/` or `/__space/docs/`. */
	readonly base: string;
}

/** The reader for an app: its own `docs/` (if any) and spacefn's docs. */
export const appDocs = ({ root, base }: AppDocsOptions): Reader => {
	const docs = join(root, "docs");
	const name = manifest(root).name ?? "app";
	const own = existsSync(docs);
	return createReader({
		base,
		name: own ? name : "spacefn",
		sources: own
			? [{ label: name, dir: docs, prefix: "" }, spacefnSource("spacefn/")]
			: [spacefnSource("")],
	});
};

export interface ServeOptions extends Omit<AppDocsOptions, "base"> {
	readonly port?: number;
	readonly host?: string;
}

/** `space docs`: the app's reader on its own server. */
export const serve = async ({ root, port = 4321, host = "localhost" }: ServeOptions) => {
	const reader = appDocs({ root, base: "/" });
	const server: Server = createServer((req, res) => void reader.handle(req, res));
	await new Promise<void>((done, fail) => {
		server.once("error", fail);
		server.listen(port, host, done);
	});
	const address = server.address();
	const url = `http://${host}:${typeof address === "object" && address ? address.port : port}/`;
	return {
		url,
		close: () =>
			new Promise<void>((done) => {
				reader.close();
				server.closeAllConnections();
				server.close(() => done());
			}),
	};
};
