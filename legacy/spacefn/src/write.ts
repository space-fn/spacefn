import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Writes `content` to `file` unless it already matches. Returns whether it wrote. */
export async function writeIfChanged(file: string, content: string): Promise<boolean> {
	const current = await readFile(file, "utf8").catch(() => undefined);
	if (current === content) return false;
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, content);
	return true;
}
