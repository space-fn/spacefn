// --- Id generation ------------------------------------------------------------

/** Lowercase hex string of `bytes * 2` characters, from a CSPRNG. */
export function hexId(bytes: number): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	let out = "";
	for (let i = 0; i < buf.length; i++) {
		out += buf[i].toString(16).padStart(2, "0");
	}
	return out;
}

/** 16 random bytes, as required for a W3C trace id. */
export function newTraceId(): string {
	return hexId(16);
}

/** 8 random bytes, as required for a W3C span id. */
export function newSpanId(): string {
	return hexId(8);
}
