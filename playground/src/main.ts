import { createServer } from "@spacefn/server";

import middlewares from "#space/middlewares";
import pages from "#space/pages";
import routes from "#space/routes";

import { getDb } from "./db/main/client";
import { createMigrator } from "./db/main/migrations";

const db = getDb();
const migrator = createMigrator(db);
await migrator.migrateToLatest();

export default createServer({ routes, pages, middlewares });
