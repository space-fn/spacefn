import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
	increment(): number {
		const value = (this.ctx.storage.kv.get<number>("value") ?? 0) + 1;
		this.ctx.storage.kv.put("value", value);
		return value;
	}
}
