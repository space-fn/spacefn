export { boolean, defineEnv, number, secret, string } from "./env/fields";
export type { Field, FieldOptions, InferEnv, Schema } from "./env/fields";
export { EnvError, parseEnv } from "./env/parse";
import { envValues } from "./env/state";

/** Augmented by the generated `.space/env.d.ts` so `env` gets the app's types. */
// oxlint-disable-next-line typescript/no-empty-interface
export interface Register {}

export type AppEnv = Register extends { env: infer E } ? E : Record<string, unknown>;
export type AppBindings = (Register extends { bindings: infer B } ? B : Record<string, unknown>) & AppEnv;

/** The validated environment declared in `env.ts`. */
export const env = envValues as AppEnv;
