import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { selectDatabase } from "../src/helpers/database.js";

describe("selectDatabase", () => {
  it("selects direct child schema files and ignores root and deeper schemas", async () => {
    const root = await mkdtemp(join(tmpdir(), "spacefn-cli-db-"));

    try {
      await mkdir(join(root, "src/db/main_db"), { recursive: true });
      await mkdir(join(root, "src/db/nested/deep"), { recursive: true });
      await writeFile(join(root, "src/db/schema.ts"), "export {};");
      await writeFile(join(root, "src/db/main_db/schema.ts"), "export {};");
      await writeFile(join(root, "src/db/nested/deep/schema.ts"), "export {};");

      const selection = selectDatabase(root);
      expect(selection.kind).toBe("selected");
      if (selection.kind !== "selected") throw new Error("Expected one nested database");
      expect(selection.database.name).toBe("main_db");
      expect(selection.database.schemaPath).toBe(resolve(root, "src/db/main_db/schema.ts"));
      expect(selection.database.migrationsDirectory).toBe(
        resolve(root, "src/db/main_db/migrations"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a root-only schema and requires selection when multiple databases exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "spacefn-cli-db-"));

    try {
      await mkdir(join(root, "src/db/alpha"), { recursive: true });
      await mkdir(join(root, "src/db/beta"), { recursive: true });
      await writeFile(join(root, "src/db/schema.ts"), "export {};");

      expect(selectDatabase(root).kind).toBe("missing");

      await writeFile(join(root, "src/db/alpha/schema.ts"), "export {};");
      await writeFile(join(root, "src/db/beta/schema.ts"), "export {};");
      expect(selectDatabase(root).kind).toBe("ambiguous");
      const selected = selectDatabase(root, "beta");
      expect(selected.kind).toBe("selected");
      if (selected.kind !== "selected") throw new Error("Expected explicit database selection");
      expect(selected.database.name).toBe("beta");
      expect(selectDatabase(root, "missing").kind).toBe("unknown");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
