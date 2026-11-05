# Relational query patterns

These queries show where spacefn's SQL-first approach gets useful: joining
related tables, aggregating child rows, and composing optional filters without
building SQL from user input. Each query stays in its own `.sql` file; named
parameters keep values separate from SQL text, and the schema-backed check
validates each query during generation.

## Schema

Create `app/db/main_db/migrations/0001_store.sql`:

```sql
-- up
CREATE TABLE customers (
	id INTEGER PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE orders (
	id INTEGER PRIMARY KEY,
	customer_id INTEGER NOT NULL REFERENCES customers(id),
	status TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE order_items (
	id INTEGER PRIMARY KEY,
	order_id INTEGER NOT NULL REFERENCES orders(id),
	product_name TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity > 0),
	unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);
```

Keep timestamps in a consistent UTC format, such as ISO 8601, if you compare
them lexically in SQL.

## Customer rollup with joins and aggregates

Create `app/db/main_db/queries/customer-spending.sql`:

```sql
-- name: customerSpending :one
-- @param customerId number
-- @column orderCount number
-- @column lifetimeCents number
-- @column latestOrderAt string?
SELECT
	c.id AS customerId,
	c.email AS email,
	c.name AS name,
	COUNT(DISTINCT o.id) AS orderCount,
	COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0) AS lifetimeCents,
	MAX(o.created_at) AS latestOrderAt
FROM customers AS c
LEFT JOIN orders AS o
	ON o.customer_id = c.id
	AND o.status <> 'cancelled'
LEFT JOIN order_items AS oi ON oi.order_id = o.id
WHERE c.id = :customerId
GROUP BY c.id, c.email, c.name;
```

The `LEFT JOIN`s keep customers with no qualifying orders in the result.
`COUNT(DISTINCT o.id)` prevents an order with several items from inflating the
order count. `COALESCE` makes the no-orders total zero; the latest order
timestamp remains nullable. Aggregates and other expressions need `@column`
annotations because the schema cannot supply their types.

Call the generated function from a route or service:

```ts
import { customerSpending } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";

const summary = await customerSpending(d1Executor(c.env.DB), { customerId: 42 });
// CustomerSpendingRow | undefined
```

The generated row has `customerId`, `orderCount`, and `lifetimeCents` as
numbers; `email` and `name` as strings; and `latestOrderAt` as
`string | null`. The function itself returns `undefined` if customer `42`
does not exist.

## Search with optional filters and pagination

Create `app/db/main_db/queries/search-orders.sql`:

```sql
-- name: searchOrders :many
-- @param status string
-- @param customerId number
-- @param createdAfter string
-- @param createdBefore string
-- @param limit number
-- @param offset number
-- @column totalCents number
SELECT
	o.id AS orderId,
	c.email AS customerEmail,
	o.status AS status,
	o.created_at AS createdAt,
	COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0) AS totalCents
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
LEFT JOIN order_items AS oi ON oi.order_id = o.id
WHERE 1 = 1
-- case
-- when status
	AND o.status = :status
-- when customerId
	AND o.customer_id = :customerId
-- when createdAfter, createdBefore
	AND o.created_at >= :createdAfter
	AND o.created_at < :createdBefore
-- end
GROUP BY o.id, c.email, o.status, o.created_at
ORDER BY o.created_at DESC, o.id DESC
LIMIT :limit OFFSET :offset;
```

The four filter parameters are optional because they appear only in gated
fragments. `limit` and `offset` are required and always bound. The paired date
range is included only when both values are present; using an exclusive upper
bound makes adjacent time windows compose without overlap.

The generated call is still ordinary typed code:

```ts
import { searchOrders } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";

const page = await searchOrders(d1Executor(c.env.DB), {
	status: "paid",
	createdAfter: "2026-01-01T00:00:00Z",
	createdBefore: "2026-02-01T00:00:00Z",
	limit: 25,
	offset: 0,
});
```

Validate `status`, page size, and offset at the request boundary. A named
parameter prevents SQL injection, but does not validate whether a value is
allowed or reasonable. For large result sets, prefer a keyset cursor over
large offsets.

## Query rules these examples use

- Every query file starts with `-- name: functionName :one|:many|:exec`.
- Use `:name` placeholders and `-- @param name type`; positional `?` is
  rejected.
- Use `-- @column name type` for expressions such as aggregates. Add `?` to
  mark a nullable result.
- Join tables and alias duplicate column names; duplicate output names fail
  generation.
- Optional `-- case` fragments must preserve the same result columns whether
  included or omitted. Generation validates the all-fragments-excluded query.
- Parameterize values. Do not interpolate user input into SQL strings.

See [Database](../directory-structure/database.md) for dialects, migrations,
executors, and dynamic query syntax.
