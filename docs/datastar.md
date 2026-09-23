# @spacefn/datastar

DataStar client attributes and server-side SSE helpers. Generate typed `data-*` attributes for reactive HTML.

## Client API

```ts
import { ds } from "@spacefn/datastar";
```

### `ds` Namespace

All client-side attributes and helpers in one object.

```ts
// Reactive data
ds.dataSignals({ count: 0 }); // { "data-signals": '{"count":0}' }
ds.dataSignal("count", "0"); // { "data-signals-count": "0" }
ds.dataText("$count"); // { "data-text": "$count" }
ds.dataBind("value", "$input"); // { "data-bind-value": "$input" }
ds.dataComputed("doubled", "$count * 2"); // { "data-computed-doubled": "$count * 2" }
ds.dataComputedAll({ doubled: "$count * 2" }); // { "data-computed": '{"doubled":"$count * 2"}' }

// DOM manipulation
ds.dataShow("$visible"); // { "data-show": "$visible" }
ds.dataClass("active", "$selected"); // { "data-class-active": "$selected" }
ds.dataAttr("disabled", "$loading"); // { "data-attr-disabled": "$loading" }
ds.dataAttrs({ disabled: "$loading" }); // { "data-attr": "{'disabled': $loading}" }
ds.dataRef("input"); // { "data-ref": "input" }

// Event handling
ds.dataOn("click", "$count++"); // { "data-on-click": "$count++" }
ds.dataOn("input", "$value", "debounce"); // { "data-on-input.__debounce": "$value" }
ds.dataIndicator("fetching"); // { "data-indicator": "fetching" }
ds.dataEffect("$log.push($count)"); // { "data-effect": "$log.push($count)" }
ds.dataInit("$count = 1"); // { "data-init": "$count = 1" }

// Control flow
ds.dataIgnore(); // { "data-ignore": "" }
ds.dataIgnoreSelf(); // { "data-ignore.__self": "" }
ds.dataIgnoreMorph(); // { "data-ignore-morph": "" }
```

### HTTP Helpers

Generate fetch expressions for `data-on`.

```ts
ds.get("/api/data"); // "get('/api/data')"
ds.get("/api/data", { merge: "append" }); // "get('/api/data', {merge:'append'})"
ds.post("/api/save"); // "post('/api/save')"
ds.post("/api/save", { contentType: "json" }); // "post('/api/save', {contentType:'json'})"
ds.put("/api/items/1"); // "put('/api/items/1')"
ds.patch("/api/items/1"); // "patch('/api/items/1')"
ds.delete("/api/items/1"); // "delete('/api/items/1')"
```

### Action Helpers

Generate action expressions.

```ts
ds.clipboard("text"); // "@clipboard('text')"
ds.toast("Saved!", { level: "success" }); // "@toast('Saved!', {level:'success'})"
ds.setAll("count", 0); // "@setAll(count, 0)"
ds.toggleAll(); // "@toggleAll()"
ds.resetAll(); // "@resetAll()"
ds.interval("$count++", 1000); // "@setInterval(() => $count++, 1000)"
ds.timeout("$visible = false", 2000); // "@setTimeout(() => $visible = false, 2000)"
```

### Action Path Helper

```ts
ds.actions.path("save"); // "?_action=save"
```

## Named Exports

For tree-shaking, import functions directly.

```ts
import { dataSignals, dataText, dataOn } from "@spacefn/datastar";

dataSignals({ count: 0 });
dataText("$count");
dataOn("click", "$count++");
```

## Server SSE

```ts
import { datastarSSE, datastarSSEStream, readSignals } from "@spacefn/datastar/server";
```

### `readSignals(request)`

Read DataStar signals from an incoming request.

- GET: signals in `?datastar=` query parameter (JSON-encoded)
- POST/PUT/PATCH/DELETE: signals in JSON body

```ts
const signals = await readSignals<{ count: number }>(request);
```

### `datastarSSE()` / `datastarSSEStream()`

Create an SSE event emitter. Batch (buffered) or streaming.

```ts
const sse = datastarSSE(); // Batch: buffers events, sends all at once
const sse = datastarSSEStream(); // Streaming: sends events immediately
```

### SSE Methods

```ts
sse.patchElements(html, options?)    // Patch DOM elements
sse.patchSignals(signals, options?)  // Patch signal values
sse.removeElements(selectors)        // Remove elements
sse.removeSignals(signalNames)       // Remove signals
sse.executeScript(script)            // Execute client script
sse.toResponse()                     // Get Response object
```

### Patch Options

```ts
sse.patchElements(html, {
  merge?: "morph" | "replace" | "inner" | "outer"
  select?: string
  settleDuration?: number
  useViewTransition?: boolean
})

sse.patchSignals(signals, {
  onlyIfMissing?: boolean
})
```

## Full Example

```ts
import { h } from "@spacefn/html";
import { ds } from "@spacefn/datastar";
import { datastarSSE, readSignals } from "@spacefn/datastar/server";

// Client-side: counter component
function counter() {
	return h.div(
		ds.dataSignals({ count: 0 }),
		h.button(ds.dataOn("click", "$count++"), "Count: ", h.span(ds.dataText("$count"), "0")),
	);
}

// Server-side: increment endpoint
async function increment(request: Request) {
	const signals = await readSignals<{ count: number }>(request);
	const sse = datastarSSE();
	sse.patchSignals({ count: signals.count + 1 });
	return sse.toResponse();
}
```
