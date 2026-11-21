import { Effect, Schema } from "effect";
import { Bus } from "spacefn";

import MainDb, { type ListTodosRow } from "#space/db/main.ts";

/** The Bus topic every change to the todos is announced on. */
export const TOPIC = "todos";

export type Todo = ListTodosRow;

/** What adding a todo takes, from a form. */
export const NewTodo = Schema.Struct({ title: Schema.NonEmptyString });

/** Which todo, from a form. */
export const TodoRef = Schema.Struct({ id: Schema.FiniteFromString });

export const list = MainDb.listTodos();

/** Adds a todo, and tells every open page. */
export const add = ({ title }: typeof NewTodo.Type) =>
	MainDb.addTodo({ title }).pipe(Effect.andThen(Bus.publish(TOPIC, "changed")));

/** Marks a todo done, or not done, and tells every open page. */
export const toggle = ({ id }: typeof TodoRef.Type) =>
	MainDb.toggleTodo({ id }).pipe(Effect.andThen(Bus.publish(TOPIC, "changed")));
