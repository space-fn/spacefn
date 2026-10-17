export interface ColumnDef {
	type: "text" | "integer" | "real" | "blob" | "json";
	primaryKey?: boolean;
	autoIncrement?: boolean;
	notNull?: boolean;
	unique?: boolean;
	default?: unknown;
	references?: string;
	index?: IndexOptions;
}

export interface IndexOptions {
	unique?: boolean;
	where?: string;
}

export interface IndexDef {
	name: string;
	columns: string[];
	options?: IndexOptions;
}

/** Internal mutable chain that produces ColumnDef */
export interface ColumnChain {
	_def: ColumnDef;
	primaryKey(): ColumnChain;
	autoIncrement(): ColumnChain;
	notNull(): ColumnChain;
	unique(): ColumnChain;
	default(value: unknown): ColumnChain;
	references(ref: string): ColumnChain;
	index(options?: IndexOptions): ColumnChain;
	/** Extract the final ColumnDef */
	build(): ColumnDef;
}

function chain(def: ColumnDef): ColumnChain {
	const c: ColumnChain = {
		_def: { ...def },
		primaryKey() {
			c._def.primaryKey = true;
			return c;
		},
		autoIncrement() {
			c._def.autoIncrement = true;
			return c;
		},
		notNull() {
			c._def.notNull = true;
			return c;
		},
		unique() {
			c._def.unique = true;
			return c;
		},
		default(value: unknown) {
			c._def.default = value;
			return c;
		},
		references(ref: string) {
			c._def.references = ref;
			return c;
		},
		index(options?: IndexOptions) {
			c._def.index = options ?? {};
			return c;
		},
		build() {
			return { ...c._def };
		},
	};
	return c;
}

function wrap(type: ColumnDef["type"]): ColumnChain {
	return chain({ type });
}

export const column = {
	text: () => wrap("text"),
	integer: () => wrap("integer"),
	real: () => wrap("real"),
	blob: () => wrap("blob"),
	json: () => wrap("json"),
};

export function index(name: string, columns: string[], options?: IndexOptions): IndexDef {
	return { name, columns, options };
}
