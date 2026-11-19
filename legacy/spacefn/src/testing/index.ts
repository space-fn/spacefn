/** Test helpers for spacefn apps. */
export async function testFetch(
	worker: {
		fetch: (request: Request, env?: unknown, ctx?: unknown) => Response | Promise<Response>;
	},
	path: string,
	init?: RequestInit,
	env?: unknown,
): Promise<Response> {
	const url = path.startsWith("http")
		? path
		: `http://localhost${path.startsWith("/") ? path : "/" + path}`;
	return worker.fetch(new Request(url, init), env);
}
