export type Dialect = "sqlite" | "postgres";

export interface DatabaseConfig {
	dialect?: Dialect;
}

export function defineDatabase(config: DatabaseConfig = {}): DatabaseConfig {
	return { dialect: config.dialect ?? "sqlite", ...config };
}
