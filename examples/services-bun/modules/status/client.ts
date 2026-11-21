/** Marks the page once the client build ran. */
export const start = () => {
	document.body.dataset.client = "ready";
};
