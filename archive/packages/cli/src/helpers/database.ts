import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface DatabasePaths {
  name: string;
  directory: string;
  schemaPath: string;
  migrationsDirectory: string;
}

export type DatabaseSelection =
  | { kind: "selected"; database: DatabasePaths }
  | { kind: "missing" }
  | { kind: "ambiguous"; available: string[] }
  | { kind: "unknown"; requestedName: string; available: string[] };

export function selectDatabase(root: string, requestedName?: string): DatabaseSelection {
  const dbRoot = resolve(root, "src/db");
  const databases = existsSync(dbRoot)
    ? readdirSync(dbRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => {
          const directory = resolve(dbRoot, name);
          const schemaPath = resolve(directory, "schema.ts");
          return {
            name,
            directory,
            schemaPath,
            migrationsDirectory: resolve(directory, "migrations"),
          };
        })
        .filter(
          (database) => existsSync(database.schemaPath) && statSync(database.schemaPath).isFile(),
        )
        .sort((left, right) => left.name.localeCompare(right.name))
    : [];

  const available = databases.map(({ name }) => name);
  if (databases.length === 0) return { kind: "missing" };

  if (requestedName !== undefined) {
    const database = databases.find(({ name }) => name === requestedName);
    return database
      ? { kind: "selected", database }
      : { kind: "unknown", requestedName, available };
  }

  if (databases.length === 1) return { kind: "selected", database: databases[0] };
  return { kind: "ambiguous", available };
}

export function databaseSelectionError(
  selection: Exclude<DatabaseSelection, { kind: "selected" }>,
): string {
  switch (selection.kind) {
    case "missing":
      return "No database schema found. Add one at src/db/<database>/schema.ts; root-level src/db/schema.ts is not supported.";
    case "ambiguous":
      return `Multiple databases found (${selection.available.join(", ")}). Pass --database <name> to select one.`;
    case "unknown":
      return `Database "${selection.requestedName}" not found. Available databases: ${selection.available.join(", ")}.`;
  }
}
