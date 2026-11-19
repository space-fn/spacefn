import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
	increment(by = 1): number {
		const value = (this.ctx.storage.kv.get<number>("value") ?? 0) + by;
		this.ctx.storage.kv.put("value", value);
		return value;
	}
}
