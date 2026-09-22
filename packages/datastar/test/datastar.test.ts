import { describe, it, expect } from "vitest";

import {
	ds,
	dataSignals,
	dataSignal,
	dataText,
	dataBind,
	dataComputed,
	dataComputedAll,
	dataShow,
	dataClass,
	dataAttr,
	dataAttrs,
	dataRef,
	dataOn,
	dataIndicator,
	dataEffect,
	dataInit,
	dataIgnore,
	dataIgnoreSelf,
	dataIgnoreMorph,
	get,
	post,
	put,
	patch,
	del,
	clipboard,
	toast,
	setAll,
	toggleAll,
	resetAll,
	interval,
	timeout,
	actions,
} from "../src/index.js";

// --- Namespace ----------------------------------------------------------------

describe("ds namespace", () => {
	it("contains all attribute generators", () => {
		expect(typeof ds.dataSignals).toBe("function");
		expect(typeof ds.dataText).toBe("function");
		expect(typeof ds.dataBind).toBe("function");
		expect(typeof ds.dataShow).toBe("function");
		expect(typeof ds.dataOn).toBe("function");
		expect(typeof ds.dataIgnore).toBe("function");
	});

	it("contains all HTTP helpers", () => {
		expect(typeof ds.get).toBe("function");
		expect(typeof ds.post).toBe("function");
		expect(typeof ds.put).toBe("function");
		expect(typeof ds.patch).toBe("function");
		expect(typeof ds.delete).toBe("function");
	});

	it("contains all action helpers", () => {
		expect(typeof ds.clipboard).toBe("function");
		expect(typeof ds.toast).toBe("function");
		expect(typeof ds.interval).toBe("function");
		expect(typeof ds.timeout).toBe("function");
	});
});

// --- Actions ------------------------------------------------------------------

describe("actions", () => {
	it("generates action path URL", () => {
		expect(actions.path("save")).toBe("?_action=save");
		expect(actions.path("loadMore")).toBe("?_action=loadMore");
	});
});

// --- Reactive data attributes -------------------------------------------------

describe("dataSignals", () => {
	it("serializes signals to JSON", () => {
		const result = dataSignals({ count: 0, name: "test" });
		expect(result).toEqual({ "data-signals": '{"count":0,"name":"test"}' });
	});

	it("handles nested objects", () => {
		const result = dataSignals({ user: { name: "Alice", age: 30 } });
		expect(result["data-signals"]).toContain('"user"');
	});
});

describe("dataSignal", () => {
	it("sets single named signal", () => {
		expect(dataSignal("count", "0")).toEqual({ "data-signals-count": "0" });
	});

	it("sets expression signal", () => {
		expect(dataSignal("doubled", "$count * 2")).toEqual({
			"data-signals-doubled": "$count * 2",
		});
	});
});

describe("dataText", () => {
	it("binds text to expression", () => {
		expect(dataText("$message")).toEqual({ "data-text": "$message" });
	});
});

describe("dataBind", () => {
	it("two-way binds attribute", () => {
		expect(dataBind("value", "$input")).toEqual({
			"data-bind-value": "$input",
		});
	});
});

describe("dataComputed", () => {
	it("creates single computed signal", () => {
		expect(dataComputed("doubled", "$count * 2")).toEqual({
			"data-computed-doubled": "$count * 2",
		});
	});
});

describe("dataComputedAll", () => {
	it("creates multiple computed signals", () => {
		const result = dataComputedAll({
			doubled: "$count * 2",
			tripled: "$count * 3",
		});
		expect(result).toEqual({
			"data-computed": '{"doubled":"$count * 2","tripled":"$count * 3"}',
		});
	});
});

// --- DOM manipulation attributes ----------------------------------------------

describe("dataShow", () => {
	it("conditionally shows element", () => {
		expect(dataShow("$visible")).toEqual({ "data-show": "$visible" });
	});
});

describe("dataClass", () => {
	it("toggles single class", () => {
		expect(dataClass("active", "$selected")).toEqual({
			"data-class-active": "$selected",
		});
	});
});

describe("dataAttr", () => {
	it("sets single attribute", () => {
		expect(dataAttr("disabled", "$loading")).toEqual({
			"data-attr-disabled": "$loading",
		});
	});
});

describe("dataAttrs", () => {
	it("sets multiple attributes", () => {
		const result = dataAttrs({
			disabled: "$loading",
			"aria-label": "$tooltip",
		});
		expect(result["data-attr"]).toContain("'disabled'");
		expect(result["data-attr"]).toContain("$loading");
	});
});

describe("dataRef", () => {
	it("creates element reference", () => {
		expect(dataRef("input")).toEqual({ "data-ref": "input" });
	});
});

// --- Event handling attributes ------------------------------------------------

describe("dataOn", () => {
	it("binds event without modifier", () => {
		expect(dataOn("click", ds.post("/api/click"))).toEqual({
			"data-on-click": "post('/api/click')",
		});
	});

	it("binds event with modifier", () => {
		expect(dataOn("input", "$value", "debounce")).toEqual({
			"data-on-input.__debounce": "$value",
		});
	});
});

describe("dataIndicator", () => {
	it("creates loading indicator", () => {
		expect(dataIndicator("fetching")).toEqual({
			"data-indicator": "fetching",
		});
	});
});

describe("dataEffect", () => {
	it("runs expression on change", () => {
		expect(dataEffect("$log.push($count)")).toEqual({
			"data-effect": "$log.push($count)",
		});
	});
});

describe("dataInit", () => {
	it("runs expression on init", () => {
		expect(dataInit("$count = 1")).toEqual({
			"data-init": "$count = 1",
		});
	});
});

// --- Control flow attributes --------------------------------------------------

describe("dataIgnore", () => {
	it("ignores element and descendants", () => {
		expect(dataIgnore()).toEqual({ "data-ignore": "" });
	});
});

describe("dataIgnoreSelf", () => {
	it("ignores only element", () => {
		expect(dataIgnoreSelf()).toEqual({ "data-ignore.__self": "" });
	});
});

describe("dataIgnoreMorph", () => {
	it("skips morphing", () => {
		expect(dataIgnoreMorph()).toEqual({ "data-ignore-morph": "" });
	});
});

// --- HTTP expression builders -------------------------------------------------

describe("get", () => {
	it("generates basic GET expression", () => {
		expect(get("/api/data")).toBe("get('/api/data')");
	});

	it("generates GET with merge option", () => {
		expect(get("/api/data", { merge: "append" })).toBe("get('/api/data'){merge:'append'}");
	});

	it("generates GET with indicator", () => {
		expect(get("/api/data", { indicator: "loading" })).toBe(
			"get('/api/data'){indicator:'loading'}",
		);
	});
});

describe("post", () => {
	it("generates basic POST expression", () => {
		expect(post("/api/save")).toBe("post('/api/save')");
	});

	it("generates POST with content type", () => {
		expect(post("/api/save", { contentType: "json" })).toBe(
			"post('/api/save'){contentType:'json'}",
		);
	});

	it("generates POST with signals filter", () => {
		expect(post("/api/save", { signals: ["count", "name"] })).toBe(
			"post('/api/save'){signals:'count,name'}",
		);
	});
});

describe("put", () => {
	it("generates PUT expression", () => {
		expect(put("/api/item/1")).toBe("put('/api/item/1')");
	});
});

describe("patch", () => {
	it("generates PATCH expression", () => {
		expect(patch("/api/item/1")).toBe("patch('/api/item/1')");
	});
});

describe("del", () => {
	it("generates DELETE expression", () => {
		expect(del("/api/item/1")).toBe("delete('/api/item/1')");
	});
});

// --- Action expression builders -----------------------------------------------

describe("clipboard", () => {
	it("generates clipboard expression", () => {
		expect(clipboard("hello")).toBe("@clipboard('hello')");
	});

	it("escapes single quotes", () => {
		expect(clipboard("it's")).toBe("@clipboard('it\\'s')");
	});
});

describe("toast", () => {
	it("generates basic toast", () => {
		expect(toast("Saved!")).toBe("@toast('Saved!')");
	});

	it("generates toast with options", () => {
		expect(toast("Error!", { level: "error", timeout: 3000 })).toBe(
			"@toast('Error!', {level:'error'}, {timeout:3000})",
		);
	});
});

describe("setAll", () => {
	it("generates setAll expression", () => {
		expect(setAll("count", 0)).toBe("@setAll(count, 0)");
	});

	it("serializes object value", () => {
		expect(setAll("user", { name: "Alice" })).toBe('@setAll(user, {"name":"Alice"})');
	});
});

describe("toggleAll", () => {
	it("generates toggleAll without pattern", () => {
		expect(toggleAll()).toBe("@toggleAll()");
	});

	it("generates toggleAll with pattern", () => {
		expect(toggleAll("show_*")).toBe("@toggleAll({include: show_*})");
	});
});

describe("resetAll", () => {
	it("generates resetAll without pattern", () => {
		expect(resetAll()).toBe("@resetAll()");
	});

	it("generates resetAll with pattern", () => {
		expect(resetAll("temp_*")).toBe("@resetAll({only: temp_*})");
	});
});

describe("interval", () => {
	it("generates setInterval expression", () => {
		expect(interval("$count++", 1000)).toBe("@setInterval(() => $count++, 1000)");
	});
});

describe("timeout", () => {
	it("generates setTimeout expression", () => {
		expect(timeout("$visible = false", 2000)).toBe("@setTimeout(() => $visible = false, 2000)");
	});
});

// --- Named exports match namespace --------------------------------------------

describe("named exports", () => {
	it("match ds namespace", () => {
		expect(dataSignals({ x: 1 })).toEqual(ds.dataSignals({ x: 1 }));
		expect(dataText("$x")).toEqual(ds.dataText("$x"));
		expect(get("/api")).toEqual(ds.get("/api"));
		expect(del("/api")).toEqual(ds.delete("/api"));
		expect(interval("fn()", 100)).toEqual(ds.interval("fn()", 100));
	});
});
