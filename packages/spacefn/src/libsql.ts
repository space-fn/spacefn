/**
 * A libSQL database over HTTP, on every target: Turso, sqld or `turso dev`.
 * It uses libSQL's fetch-only client, so it runs in Workers, Durable Objects,
 * Bun and Node alike. Give the connection to a database class for a database
 * the app opens itself (`"open": "manual"`):
 *
 * ```ts
 * import { libsql } from "spacefn/libsql";
 *
 * ShopDb.layer(libsql({ url: "libsql://shop-acme.turso.io", authToken }));
 * ```
 *
 * A `file:` database needs the native client: `libsqlDatabase` from `spacefn/bun`.
 */
export { libsql, type LibsqlOptions } from "./db/libsql.ts";
export type { DbConnection } from "./db/connection.ts";
