import { html } from "spacefn";

export const statusView = (status: {
	readonly greeting: string;
	readonly notes: number;
	readonly job: string;
	readonly secretLength: number;
}) => html`${status.greeting} ${status.notes} ${status.job} ${status.secretLength}`;
