import { rocket } from "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.5/bundles/datastar-rocket.js";

/**
 * `<poll-meter label="Tabs" value="40">`: a labelled bar, `value` in percent.
 * A Rocket custom element (beta): it renders in its own shadow root, and renders
 * again when Datastar morphs new attributes in. Custom element names have a
 * hyphen; start them with the feature's name.
 */
export const definePollMeter = () =>
	rocket("poll-meter", {
		props: ({ number, string }) => ({
			label: string.trim.default(""),
			value: number.clamp(0, 100).default(0),
		}),
		render: ({ html, props: { label, value } }) => html`
			<style>
				:host {
					display: grid;
					grid-template-columns: 1fr 3rem;
					gap: 0.25rem 0.5rem;
				}
				.bar {
					grid-column: 1 / -1;
					height: 0.5rem;
					border-radius: 0.25rem;
					background: color-mix(in srgb, currentColor 15%, transparent);
				}
				.fill {
					height: 100%;
					border-radius: inherit;
					background: currentColor;
					transition: width 0.3s;
				}
			</style>
			<span>${label}</span>
			<span>${value}%</span>
			<span class="bar"><span class="fill" style="width: ${value}%"></span></span>
		`,
	});
