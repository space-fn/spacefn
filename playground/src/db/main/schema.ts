import { defineTable, column } from "@spacefn/db";

// --- Users ---
export const users = defineTable("users", {
	id: column.id(),
	email: column.string().unique(),
	name: column.string(),
	password: column.text(),
	role: column.enum("admin", "user").default("user"),
	createdAt: column.timestamps().create,
	updatedAt: column.timestamps().update,
});

// --- URLs ---
export const urls = defineTable("urls", {
	id: column.id(),
	slug: column.string(8).unique(),
	destination: column.text(),
	title: column.string().nullable(),
	userId: column.integer().references("users", "id"),
	isActive: column.boolean().default("true"),
	expiresAt: column.timestamp().nullable(),
	createdAt: column.timestamps().create,
	updatedAt: column.timestamps().update,
});

// --- Clicks ---
export const clicks = defineTable("clicks", {
	id: column.id(),
	urlId: column.integer().references("urls", "id"),
	ip: column.string().nullable(),
	userAgent: column.text().nullable(),
	referer: column.text().nullable(),
	country: column.string(2).nullable(),
	createdAt: column.timestamp().default("now()"),
});
