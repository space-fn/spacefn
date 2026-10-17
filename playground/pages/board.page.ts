import { definePage, html } from "spacefn/pages";

export default definePage<{ todos: { id: number; title: string; done: number }[] }>(
	(props) => html`<!doctype html>
<html>
	<head><meta charset="utf-8"><title>Board</title></head>
	<body>
		<h1>Board</h1>
		<form method="post" action="/board?_action=add">
			<input name="title" required maxlength="200" />
			<button>Add</button>
		</form>
		<ul>${props.todos.map((todo) => html`<li>${todo.title}</li>`)}</ul>
	</body>
</html>`,
);
