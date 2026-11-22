// `pnpm examples`: remakes examples/starter-cloudflare and examples/starter-bun from
// the create-spacefn template, with workspace versions. Their node_modules, .space/
// and .env are kept.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

import { scaffold, TARGETS } from "../packages/create-spacefn/src/scaffold.ts";

const KEEP = new Set(["node_modules", ".space", ".env"]);
const root = new URL("../examples/", import.meta.url).pathname;

for (const target of TARGETS) {
	const dir = join(root, `starter-${target}`);
	const fresh = `${dir}.new`;
	rmSync(fresh, { recursive: true, force: true });
	scaffold(fresh, { name: `starter-${target}`, target, workspace: true });
	if (existsSync(dir))
		for (const entry of readdirSync(dir))
			if (!KEEP.has(entry)) rmSync(join(dir, entry), { recursive: true });
	mkdirSync(dir, { recursive: true });
	for (const entry of readdirSync(fresh)) renameSync(join(fresh, entry), join(dir, entry));
	rmSync(fresh, { recursive: true });
	console.log(`examples/starter-${target}: made from the template`);
}
