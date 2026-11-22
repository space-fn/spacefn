/** Marks the page once the client build ran. */
export const markReady = () => {
	document.body.dataset.client = "ready";
};
