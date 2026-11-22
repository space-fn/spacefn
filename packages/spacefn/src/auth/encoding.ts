/** Base64url without padding, the form used for salts, hashes and tokens. */
export const toBase64Url = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Decodes base64url, or gives `undefined` for anything else: cookies and tokens are untrusted. */
export const fromBase64Url = (text: string): Uint8Array | undefined => {
	if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined;
	const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** Compares two byte arrays without stopping at the first difference. */
export const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
	return diff === 0;
};

/** `count` cryptographically random bytes. */
export const randomBytes = (count: number): Uint8Array =>
	crypto.getRandomValues(new Uint8Array(count));
