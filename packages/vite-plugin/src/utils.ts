const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "all"] as const;

export function buildRoutePath(filePath: string, prefix: string): string {
	const rel = filePath.replace(new RegExp(`^${prefix}/`), "").replace(/\.ts$/, "");
	let routePath = rel
		.replace(/index$/, "")
		.replace(/\[(\w+)\]/g, ":$1")
		.replace(/\[\.\.\.(\w+)\]/g, "/*");

	if (!routePath || routePath === "/") {
		routePath = "/";
	} else if (!routePath.startsWith("/")) {
		routePath = "/" + routePath;
	}

	return routePath;
}

export function parseMethodPostfix(filePath: string): string | null {
	const name = filePath.split("/").pop()!.replace(/\.ts$/, "");
	const lastDot = name.lastIndexOf(".");
	if (lastDot === -1) return null;
	const suffix = name.slice(lastDot + 1);
	return HTTP_METHODS.includes(suffix as any) ? suffix : null;
}
