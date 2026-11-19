import { bindings, exports } from "cf/config";

/** `counter.ts` becomes `Counter`. */
export function className(file: string): string {
	const base = file.replace(/\.(?:[cm]?[jt]s|[jt]sx)$/, "");
	return base
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

/** Splits a PascalCase class name into UPPER_SNAKE_CASE. */
function snakeCase(name: string): string {
	return name
		.replace(/([A-Z])/g, "_$1")
		.replace(/^_/, "")
		.toUpperCase();
}

/** The binding name for a Durable Object: `DO_CHAT_ROOM` (from `ChatRoom`). */
export function durableObjectBinding(file: string): string {
	return `DO_${snakeCase(className(file))}`;
}

/** Config entries a `durable-objects/` folder implies. */
export function durableObjectsConfig(files: string[], workerName: string) {
	const exportsMap: Record<string, ReturnType<typeof exports.durableObject>> = {};
	const env: Record<string, ReturnType<typeof bindings.durableObject>> = {};
	for (const file of files) {
		const name = className(file);
		exportsMap[name] = exports.durableObject({ storage: "sqlite" });
		env[durableObjectBinding(file)] = bindings.durableObject({
			worker: workerName,
			exportName: name,
		});
	}
	return { exports: exportsMap, env };
}
