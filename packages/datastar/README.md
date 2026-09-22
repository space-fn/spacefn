# @spacefn/datastar

DataStar client attributes and server-side SSE helpers. Generate typed `data-*` attributes for reactive HTML.

## Install

```bash
pnpm add @spacefn/datastar
```

## Quick Start

```ts
import { ds } from "@spacefn/datastar";
import { h } from "@spacefn/html";

const counter = h.div(
	ds.dataSignals({ count: 0 }),
	h.button(ds.dataOn("click", "$count++"), "Count: ", h.span(ds.dataText("$count"), "0")),
);
```

## API

### `ds` Namespace

All client-side attributes and helpers in one object.

```ts
import { ds } from "@spacefn/datastar";

ds.dataSignals({ count: 0 }); // { "data-signals": '{"count":0}' }
ds.dataText("$count"); // { "data-text": "$count" }
ds.dataShow("$visible"); // { "data-show": "$visible" }
ds.dataOn("click", "$count++"); // { "data-on-click": "$count++" }
```

### Named Exports

For tree-shaking, use named exports.

```ts
import { dataSignals, dataText, dataOn } from "@spacefn/datastar";

dataSignals({ count: 0 });
dataText("$count");
dataOn("click", "$count++");
```

### Reactive Attributes

```ts
ds.dataSignals({ count: 0 }); // Define signals
ds.dataSignal("name", "expression"); // Single signal
ds.dataText("$count"); // Bind text
ds.dataBind("value", "$input"); // Two-way binding
ds.dataComputed("doubled", "$count * 2"); // Read-only computed
ds.dataComputedAll({ doubled: "$count * 2" }); // Multiple computed
```

### DOM Attributes

```ts
ds.dataShow("$visible"); // Show/hide
ds.dataClass("active", "$selected"); // Toggle class
ds.dataAttr("disabled", "$loading"); // Set attribute
ds.dataAttrs({ disabled: "$loading" }); // Set multiple
ds.dataRef("input"); // Element reference
```

### Event Attributes

```ts
ds.dataOn("click", "expression"); // Basic event
ds.dataOn("input", "$value", "debounce"); // With modifier
ds.dataIndicator("fetching"); // Loading indicator
ds.dataEffect("$log.push($count)"); // Run on change
ds.dataInit("$count = 1"); // Run on init
```

### Control Flow

```ts
ds.dataIgnore(); // Skip element and descendants
ds.dataIgnoreSelf(); // Skip element only
ds.dataIgnoreMorph(); // Skip morphing
```

### HTTP Helpers

Generate fetch expressions for `data-on`.

```ts
ds.get("/api/data"); // GET request
ds.get("/api/data", { merge: "append" }); // With merge
ds.post("/api/save"); // POST request
ds.post("/api/save", { contentType: "json" }); // JSON content type
ds.put("/api/items/1"); // PUT request
ds.patch("/api/items/1"); // PATCH request
ds.delete("/api/items/1"); // DELETE request
```

### Action Helpers

Generate action expressions.

```ts
ds.clipboard("text"); // @clipboard('text')
ds.toast("Saved!", { level: "success" }); // @toast('Saved!', ...)
ds.setAll("count", 0); // @setAll(count, 0)
ds.toggleAll(); // @toggleAll()
ds.resetAll(); // @resetAll()
ds.interval("$count++", 1000); // @setInterval(() => $count++, 1000)
ds.timeout("$visible = false", 2000); // @setTimeout(() => ..., 2000)
```

## Server SSE

For server-side responses that patch the client.

```ts
import { datastarSSE, readSignals } from "@spacefn/datastar/server";

// Read signals from request
const signals = await readSignals<{ count: number }>(request);

// Send SSE response
const sse = datastarSSE();
sse.patchSignals({ count: signals.count + 1 });
sse.patchElements('<div id="count">1</div>');
return sse.toResponse();
```

### SSE Methods

```ts
const sse = datastarSSE()           // Batch (buffered)
const sse = datastarSSEStream()     // Streaming

sse.patchElements(html, options?)   // Patch DOM elements
sse.patchSignals(signals, options?) // Patch signal values
sse.removeElements(selector)        // Remove elements
sse.removeSignals(names)            // Remove signals
sse.executeScript(script)           // Execute client script
sse.toResponse()                    // Get Response object
```

### `readSignals(request)`

Read DataStar signals from an incoming request.

- GET: signals in `?datastar=` query parameter (JSON-encoded)
- POST/PUT/PATCH/DELETE: signals in JSON body

```ts
const signals = await readSignals<{ count: number }>(request);
```
