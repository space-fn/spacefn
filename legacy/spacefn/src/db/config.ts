export type Dialect = "sqlite" | "postgres";
export type Driver = "d1" | "libsql";

export interface DatabaseConfig {
	dialect?: Dialect;
	driver?: Driver;
}

export function defineDatabase(config: DatabaseConfig = {}): DatabaseConfig {
	return { dialect: config.dialect ?? "sqlite", ...config };
}
