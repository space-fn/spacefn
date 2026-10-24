import { bindings, exports } from "cf/config";

/** `order-fulfillment.ts` becomes `OrderFulfillment`. */
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

/** The binding name for a Workflow: `WF_ORDER_FULFILMENT` (from `OrderFulfilment`). */
export function workflowBinding(file: string): string {
	return `WF_${snakeCase(className(file))}`;
}

/** The workflow name used in config: `order-fulfillment`. */
export function workflowName(file: string): string {
	return file.replace(/\.(?:[cm]?[jt]s|[jt]sx)$/, "");
}

/** Config entries a `workflows/` folder implies. */
export function workflowsConfig(files: string[], workerName: string) {
	const exportsMap: Record<string, ReturnType<typeof exports.workflow>> = {};
	const env: Record<string, ReturnType<typeof bindings.workflow>> = {};
	for (const file of files) {
		const name = className(file);
		exportsMap[name] = exports.workflow({ name: workflowName(file) });
		env[workflowBinding(file)] = bindings.workflow({
			name: workflowName(file),
			worker: workerName,
			exportName: name,
		});
	}
	return { exports: exportsMap, env };
}
