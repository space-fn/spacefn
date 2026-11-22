import { html } from "spacefn";

/** What the last job left, for the dev and deploy tests to read. */
export const statusView = (status: { readonly job: string }) => html`<p>${status.job}</p>`;
