// The types this example uses of Datastar's Rocket bundle, which it loads from the
// CDN: Rocket is in beta, and its published types are at
// https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.5/bundles/datastar-rocket.d.ts.
declare module "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.5/bundles/datastar-rocket.js" {
	interface Codec<T> {
		readonly default: (value: T) => Codec<T>;
	}
	interface StringCodec extends Codec<string> {
		readonly trim: StringCodec;
	}
	interface NumberCodec extends Codec<number> {
		readonly clamp: (min: number, max: number) => NumberCodec;
	}
	interface AnyCodec {
		readonly default: (value: never) => unknown;
	}
	type Props<D> = { readonly [K in keyof D]: D[K] extends Codec<infer T> ? T : never };
	export function rocket<D extends Record<string, AnyCodec>>(
		tag: `${string}-${string}`,
		options: {
			readonly mode?: "open" | "closed" | "light";
			readonly props?: (codecs: { string: StringCodec; number: NumberCodec }) => D;
			readonly render?: (context: {
				readonly html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
				readonly props: Props<D>;
				readonly host: HTMLElement;
			}) => unknown;
		},
	): void;
}
