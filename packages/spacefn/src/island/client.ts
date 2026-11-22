import type { Island, IslandStart } from "../island.ts";

type Start = IslandStart<unknown>;

/** Shared by every copy of this module a page loads, so each island file finds the element class. */
const starts: Map<string, Start> = ((globalThis as Record<symbol, unknown>)[
	Symbol.for("spacefn/islands")
] ??= new Map()) as Map<string, Start>;

const TAG = "spacefn-island";

/** `<spacefn-island name>`: starts its island's component when connected, stops it when removed. */
const define = () => {
	if (customElements.get(TAG)) return;
	customElements.define(
		TAG,
		class extends HTMLElement {
			#props: { value: unknown } | undefined;
			#stop: (() => void) | undefined;
			#started = false;

			connectedCallback() {
				this.start();
			}

			disconnectedCallback() {
				this.#started = false;
				this.#stop?.();
				this.#stop = undefined;
			}

			/** Runs the island's `start`, once its file has loaded; a no-op when it already runs. */
			start() {
				const start = starts.get(this.getAttribute("name") ?? "");
				if (!start || this.#started) return;
				if (!this.#props) {
					const script = this.querySelector(':scope > script[type="application/json"]');
					this.#props = { value: JSON.parse(script?.textContent || "null") };
					script?.remove();
				}
				this.#started = true;
				this.#stop = start(this, this.#props.value) ?? undefined;
			}
		},
	);
};

/** `island(...)` in the browser: registers `start` and runs it in the page's elements with this name. */
export const clientIsland = <P>(name: string, start: IslandStart<P>): Island<P> => {
	starts.set(name, start as Start);
	define();
	for (const element of document.querySelectorAll(`${TAG}[name="${CSS.escape(name)}"]`))
		(element as HTMLElement & { start(): void }).start();
	return {
		name,
		render: () => {
			throw new Error(`${name}: render() runs on the server; the browser starts the island itself`);
		},
	};
};
