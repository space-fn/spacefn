import { column, defineSchema } from "@spacefn/asteroids";

export const schema = defineSchema({
  users: {
    id: column.integer().primaryKey().autoIncrement(),
    name: column.text().notNull(),
    email: column.text().unique().notNull(),
    createdAt: column.text().default("CURRENT_TIMESTAMP"),
  },
});
