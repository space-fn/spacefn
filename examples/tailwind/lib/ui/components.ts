import { html, type HtmlValue } from "spacefn";

// The UI kit: components every feature uses, built from Tailwind classes and the
// theme's tokens. Write class names out in full, so Tailwind finds them in this file.

export const card = (body: HtmlValue) =>
	html`<article
		class="rounded-card border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
	>
		${body}
	</article>`;

const TONES = {
	brand: "bg-brand-50 text-brand-700",
	gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
} as const;

export const badge = (text: string, tone: keyof typeof TONES = "gray") =>
	html`<span class="${`rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}"
		>${text}</span
	>`;
