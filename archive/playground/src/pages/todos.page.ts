import { ds } from "@spacefn/datastar";
import { defineComponent, h } from "@spacefn/html";
import type { LoaderReturnType } from "@spacefn/server";

import { cssOutput, layoutSx, headerSx, cardSx, formSx, btnSx, filterSx } from "../styles";
import { renderTodoList } from "../todo-list";
import type { loader } from "./todos.server";

type Props = LoaderReturnType<typeof loader>;

export default defineComponent<Props>((props) => {
	return h.html(
		{},
		h.head(
			{},
			h.meta({ charset: "utf-8" }),
			h.meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
			h.title({}, "Todos — Space"),
			h.style({}, cssOutput),
		),
		h.body(
			{},
			h.div(
				{
					class: layoutSx.base,
					...ds.signals({ filter: "all" }),
				},

				// --- Header ---
				h.header(
					{ class: headerSx.base },
					h.h1({ class: headerSx.title }, "📋 Todos"),
					h.p(
						{ class: headerSx.subtitle },
						`${props.todos.filter((t) => !t.completed).length} remaining · ${props.todos.filter((t) => t.completed).length} completed`,
					),
				),

				// --- New Todo Form ---
				h.div(
					{ class: cardSx.base, style: "margin-bottom:1.5rem" },
					h.form(
						{
							class: formSx.base,
							"data-on-submit": `@post('/api/todos/create', {signals:['title','description','categoryId','priority']})`,
						},
						h.input({
							class: formSx.input,
							type: "text",
							placeholder: "What needs to be done?",
							...ds.bind("title"),
						}),
						h.select(
							{
								class: formSx.select,
								...ds.bind("categoryId"),
							},
							h.option({ value: "" }, "No category"),
							...props.categories.map((cat) => h.option({ value: String(cat.id) }, cat.name)),
						),
						h.select(
							{
								class: formSx.select,
								...ds.bind("priority"),
							},
							h.option({ value: "low" }, "Low"),
							h.option({ value: "medium" }, "Medium"),
							h.option({ value: "high" }, "High"),
						),
						h.button(
							{
								class: btnSx({ color: "primary" }).base,
								type: "submit",
							},
							"Add",
						),
					),
					h.input({
						class: formSx.input,
						type: "text",
						placeholder: "Description (optional)",
						style: "width:100%;box-sizing:border-box;margin-top:0.5rem",
						...ds.bind("description"),
					}),
				),

				// --- Filters ---
				h.div(
					{ class: filterSx.base },
					h.button(
						{
							class: `${filterSx.button} ${filterSx.active}`,
							...ds.class("filter-active-all", "$filter === 'all'"),
							...ds.on("click", "$filter = 'all'"),
						},
						"All",
					),
					h.button(
						{
							class: filterSx.button,
							...ds.class("filter-active-active", "$filter === 'active'"),
							...ds.on("click", "$filter = 'active'"),
						},
						"Active",
					),
					h.button(
						{
							class: filterSx.button,
							...ds.class("filter-active-completed", "$filter === 'completed'"),
							...ds.on("click", "$filter = 'completed'"),
						},
						"Completed",
					),
				),

				// --- Todo List ---
				h.div(
					{ class: cardSx.base, style: "padding:0;overflow:hidden" },
					h.div(
						{
							id: "todo-list",
							"data-on-click": `@get('/api/todos/toggle', {signals:['id']})`,
						},
						renderTodoList(props.todos),
					),
				),
			),
		),
	);
});
