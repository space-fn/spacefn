// --- Route, Middleware & Page Scanner ------------------------------------------
// Scans src/routes/, src/middlewares/ and src/pages/ for convention-based files

import { readdir } from "node:fs/promises";
import { join, relative, basename } from "node:path";

import type { ScannedRoute, ScannedMiddleware, ScannedPage } from "./types.js";

// --- Route Scanner ------------------------------------------------------------

/**
 * Convert file path to URL pattern.
 *
 * File naming convention:
 *   index.ts          → /
 *   books/index.ts    → /books
 *   books/index.get.ts → /books (GET)
 *   books/[slug]/index.get.ts → /books/:slug (GET)
 *   categories/[id].ts → /categories/:id
 */
function fileToPattern(filePath: string): string {
 const parts = filePath
  .replace(/\.get\.ts$/, "")
  .replace(/\.post\.ts$/, "")
  .replace(/\.put\.ts$/, "")
  .replace(/\.delete\.ts$/, "")
  .replace(/\.patch\.ts$/, "")
  .replace(/\.ts$/, "")
  .split("/")
  .filter(Boolean);

 const mapped = parts
  .map((part) => {
   // Dynamic segment: [slug] → :slug
   if (part.startsWith("[") && part.endsWith("]")) {
    return `:${part.slice(1, -1)}`;
   }
   // Catch-all: [...slug] → *slug
   if (part.startsWith("[...") && part.endsWith("]")) {
    return `*${part.slice(4, -1)}`;
   }
   return part;
  })
  .filter((part) => part !== "index");

 if (mapped.length === 0) return "/";
 return "/" + mapped.join("/");
}

/**
 * Extract HTTP method from filename.
 *   index.ts → "*" (all methods)
 *   index.get.ts → "GET"
 *   index.post.ts → "POST"
 */
function fileToMethod(filePath: string): string {
 const name = basename(filePath);
 const match = name.match(/\.(get|post|put|delete|patch)\.ts$/);
 if (!match) return "*";
 return match[1].toUpperCase();
}

/** Recursively scan a directory for .ts files */
async function scanDir(dir: string): Promise<string[]> {
 const entries: string[] = [];

 try {
  const items = await readdir(dir, { withFileTypes: true });
  for (const item of items) {
   const fullPath = join(dir, item.name);
   if (item.isDirectory()) {
    entries.push(...(await scanDir(fullPath)));
   } else if (item.name.endsWith(".ts") && !item.name.endsWith(".d.ts")) {
    entries.push(fullPath);
   }
  }
 } catch {
  // Directory doesn't exist
 }

 return entries;
}

/** Scan src/routes/ for route files */
export async function scanRoutes(root: string): Promise<ScannedRoute[]> {
 const routesDir = join(root, "src", "routes");
 const files = await scanDir(routesDir);

 return files.map((file) => {
  const rel = relative(routesDir, file).replace(/\.ts$/, "");
  return {
   path: rel,
   file,
   pattern: fileToPattern(rel),
   method: fileToMethod(file),
  };
 });
}

// --- Middleware Scanner -------------------------------------------------------

/**
 * Extract sort order from filename.
 *   1.logger.ts → 1
 *   cors.ts → Infinity (no prefix = last)
 */
function fileToOrder(filePath: string): number {
 const name = basename(filePath);
 const match = name.match(/^(\d+)\./);
 if (!match) return Infinity;
 return Number.parseInt(match[1], 10);
}

/** Scan src/middlewares/ for middleware files */
export async function scanMiddlewares(root: string): Promise<ScannedMiddleware[]> {
 const mwDir = join(root, "src", "middlewares");
 const files = await scanDir(mwDir);

 const middlewares = files.map((file) => {
  const name = basename(file)
   .replace(/\.\d+\./, ".")
   .replace(/\.ts$/, "");
  return {
   path: relative(mwDir, file),
   file,
   order: fileToOrder(file),
   name,
  };
 });

 // Sort by order
 return middlewares.sort((a, b) => a.order - b.order);
}

// --- Page Scanner -------------------------------------------------------------

/**
 * Scan src/pages/ for *.page.ts and *.server.ts files.
 * Matches pairs by base name (e.g., index.page.ts + index.server.ts).
 *
 * File naming convention (same as routes):
 *   index.page.ts + index.server.ts   → /
 *   books/index.page.ts               → /books
 *   books/[slug].page.ts              → /books/:slug
 */
export async function scanPages(root: string): Promise<ScannedPage[]> {
 const pagesDir = join(root, "src", "pages");
 const files = await scanDir(pagesDir);

 // Group files by base path (without .page.ts / .server.ts suffix)
 const pageFiles = new Map<string, string>(); // basePath → absolute path
 const serverFiles = new Map<string, string>();

 for (const file of files) {
  const rel = relative(pagesDir, file);
  if (rel.endsWith(".page.ts")) {
   const basePath = rel.replace(/\.page\.ts$/, "");
   pageFiles.set(basePath, file);
  } else if (rel.endsWith(".server.ts")) {
   const basePath = rel.replace(/\.server\.ts$/, "");
   serverFiles.set(basePath, file);
  }
 }

 // Merge all unique base paths
 const allPaths = new Set([...pageFiles.keys(), ...serverFiles.keys()]);

 const pages: ScannedPage[] = [];
 for (const basePath of allPaths) {
  pages.push({
   path: basePath,
   pattern: fileToPattern(basePath),
   pageFile: pageFiles.get(basePath) ?? null,
   serverFile: serverFiles.get(basePath) ?? null,
   hasLoader: false, // Will be determined during code generation
   hasActions: false,
  });
 }

 return pages;
}
