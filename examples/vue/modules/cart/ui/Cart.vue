<script setup lang="ts">
import { computed, reactive } from "vue";

import { formatPrice, type Product } from "../cart.ts";

// The cart: add products, see the total. Its state lives in the browser.
const props = defineProps<{ products: readonly Product[] }>();
const counts = reactive<Record<string, number>>({});
const total = computed(() =>
	props.products.reduce((sum, product) => sum + product.price * (counts[product.id] ?? 0), 0),
);
</script>

<template>
	<div class="cart">
		<ul>
			<li v-for="product in products" :key="product.id">
				<span>{{ product.name }}</span>
				<button type="button" @click="counts[product.id] = (counts[product.id] ?? 0) + 1">
					Add
				</button>
				<output>{{ counts[product.id] ?? 0 }}</output>
			</li>
		</ul>
		<p>Total: {{ formatPrice(total) }}</p>
	</div>
</template>
