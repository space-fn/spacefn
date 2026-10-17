import { scanCodeFiles } from "../scan";

/**
 * Lists the middleware files in `dir`, sorted by name so numeric prefixes set
 * the order (`01-auth.ts` runs before `02-log.ts`).
 */
export const scanMiddleware = scanCodeFiles;
