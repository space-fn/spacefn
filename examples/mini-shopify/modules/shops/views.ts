import { html } from "spacefn";

/** The platform's home: every shop, and a form to open one. */
export const shopsPage = (props: {
	readonly shops: readonly { readonly slug: string; readonly name: string }[];
	/** Where the form posts. */
	readonly create: string;
	readonly invalid: boolean;
}) =>
	html`<main>
		<h1>Shops</h1>
		<ul>
			${props.shops.map((shop) => html`<li><a href="/s/${shop.slug}">${shop.name}</a></li>`)}
		</ul>
		<form method="post" action="${props.create}">
			<input name="name" placeholder="Name" required />
			<input
				name="slug"
				placeholder="address, e.g. acme"
				pattern="[a-z0-9][a-z0-9-]{1,30}"
				required
			/>
			<button>Open a shop</button>
		</form>
		${props.invalid ? html`<p role="alert">Give the shop a name, and an address of lowercase letters, digits and dashes.</p>` : ""}
	</main>`;
