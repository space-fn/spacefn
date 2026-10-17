import { defineSchema, column, index } from "@spacefn/asteroids";

export const schema = defineSchema({
  users: {
    id: column.integer().primaryKey().autoIncrement(),
    email: column.text().notNull().index({ unique: true }),
    name: column.text().notNull(),
    role: column.text().default("user"),
    createdAt: column.text().default("CURRENT_TIMESTAMP"),

    _indexes: [index("idx_users_role", ["role"])],
  },
});
