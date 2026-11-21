<script lang="ts">
	import { formatPrice, type Product } from "../cart.ts";

	// The cart: add products, see the total. Its state lives in the browser.
	let { products }: { products: readonly Product[] } = $props();
	let counts = $state<Record<string, number>>({});
	let total = $derived(
		products.reduce((sum, product) => sum + product.price * (counts[product.id] ?? 0), 0),
	);
</script>

<div class="cart">
	<ul>
		{#each products as product (product.id)}
			<li>
				<span>{product.name}</span>
				<button type="button" onclick={() => (counts[product.id] = (counts[product.id] ?? 0) + 1)}>Add</button>
				<output>{counts[product.id] ?? 0}</output>
			</li>
		{/each}
	</ul>
	<p>Total: {formatPrice(total)}</p>
</div>
