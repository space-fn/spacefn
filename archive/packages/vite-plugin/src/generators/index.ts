export { apiGenerator } from "./api.js";
export { pageGenerator } from "./page.js";
export { dbGenerator } from "./db.js";

import { apiGenerator } from "./api.js";
import { dbGenerator } from "./db.js";
import { pageGenerator } from "./page.js";

/** Create all generators at once */
export function generators() {
	return [apiGenerator(), pageGenerator(), dbGenerator()];
}
