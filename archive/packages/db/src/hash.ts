import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const VERSION_FILE = ".schema-version";

export function computeSchemaHash(schemaContent: string): string {
	return createHash("sha256").update(schemaContent).digest("hex").slice(0, 12);
}

export function readSchemaVersion(root: string): string | null {
	const path = resolve(root, VERSION_FILE);
	if (!existsSync(path)) return null;
	return readFileSync(path, "utf-8").trim();
}

export function writeSchemaVersion(root: string, hash: string): void {
	const path = resolve(root, VERSION_FILE);
	writeFileSync(path, hash, "utf-8");
}

export function hasSchemaChanged(root: string, schemaContent: string): boolean {
	const currentHash = computeSchemaHash(schemaContent);
	const storedHash = readSchemaVersion(root);
	return currentHash !== storedHash;
}
