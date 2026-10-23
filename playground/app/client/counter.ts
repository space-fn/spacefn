import { formatCount } from "./_shared";

export function initCounter(root: HTMLElement): void {
	let n = 0;
	const button = root.querySelector("button");
	const label = root.querySelector("span");
	button?.addEventListener("click", () => {
		n += 1;
		if (label) label.textContent = formatCount(n);
	});
}
