import type { AppPlan, IslandFramework, PlannedIsland } from "./plan.ts";
import { GENERATED } from "./render-manifest.ts";

const str = JSON.stringify;

/** Where an island's browser entry is, from the app root; the Vite client input. */
export const islandEntry = (name: string): string => `.space/islands/${name}.ts`;

/** The props type of each framework's component, from `spacefn/islands`. */
const PROPS: Record<IslandFramework, string> = {
	react: "FunctionProps",
	solid: "FunctionProps",
	vue: "VueProps",
	svelte: "SvelteProps",
	start: "StartProps",
};

/** How each framework starts `Component` in `element`, and what stops it. */
const START: Record<IslandFramework, { imports: string[]; start: string }> = {
	react: {
		imports: [
			'import { createElement } from "react";',
			'import { createRoot } from "react-dom/client";',
		],
		start: [
			"(element, props) => {",
			"\tconst root = createRoot(element);",
			"\troot.render(createElement(Component, props));",
			"\treturn () => root.unmount();",
			"}",
		].join("\n"),
	},
	solid: {
		imports: ['import { createComponent, render } from "solid-js/web";'],
		start: "(element, props) => render(() => createComponent(Component, props ?? {}), element)",
	},
	vue: {
		imports: ['import { createApp } from "vue";'],
		start: [
			"(element, props) => {",
			"\tconst app = createApp(Component, props);",
			"\tapp.mount(element);",
			"\treturn () => app.unmount();",
			"}",
		].join("\n"),
	},
	svelte: {
		imports: ['import { mount, unmount } from "svelte";'],
		start: [
			"(target, props) => {",
			"\tconst component = mount(Component, { target, props: props ?? {} });",
			"\treturn () => void unmount(component);",
			"}",
		].join("\n"),
	},
	start: { imports: [], start: "Component" },
};

/** `.space/islands/<Name>.ts`: the island's browser entry, starting its component. */
const renderEntry = (island: PlannedIsland): string => {
	const { imports, start } = START[island.framework];
	return [
		GENERATED,
		"// @ts-nocheck: the framework's own types aren't this file's business.",
		...imports,
		'import { defineIsland } from "spacefn/internal/island/client";',
		"",
		`import Component from ${str(`../../${island.file}`)};`,
		"",
		`defineIsland(${str(island.name)}, ${start});`,
		"",
	].join("\n");
};

/**
 * `.space/islands.ts`, which the app imports for `island(name, props)`, with
 * each island's props from its component; and each island's browser entry.
 */
export const renderIslands = (plan: AppPlan): Record<string, string> => {
	const helpers = [...new Set(plan.islands.map((island) => PROPS[island.framework]))].sort();
	const types = helpers.map((name) => `type ${name}`).join(", ");
	return {
		"islands.ts": [
			GENERATED,
			`import { islands${types ? `, ${types}` : ""} } from "spacefn/islands";`,
			"",
			"/** The app's islands, the *.island.* files, by name, with their components' props. */",
			"export interface Islands {",
			...plan.islands.map(
				(island) =>
					`\t${str(island.name)}: ${PROPS[island.framework]}<typeof import(${str(`../${island.file}`)}).default>;`,
			),
			"}",
			"",
			'/** The island\'s element, its props and its script (once per response): island("Cart", { products }). */',
			"export const island = islands<Islands>();",
			"",
		].join("\n"),
		...Object.fromEntries(
			plan.islands.map((island) => [`islands/${island.name}.ts`, renderEntry(island)]),
		),
	};
};
