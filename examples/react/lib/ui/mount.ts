/**
 * In the browser: starts a client component in the element `island(id, props)`
 * rendered, with its props. Does nothing on a page without one.
 */
export const mountIsland = <P>(id: string, start: (element: HTMLElement, props: P) => void) => {
	const element = document.getElementById(id);
	if (element) start(element, JSON.parse(element.dataset.props ?? "{}") as P);
};
