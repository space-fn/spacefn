import type { AppPlan } from "./plan.ts";
import { renderDb } from "./render-db.ts";
import { renderIslands } from "./render-islands.ts";
import { renderManifest } from "./render-manifest.ts";
import { renderAssetTypes, renderEntries, renderInfra, renderViteConfig } from "./render-target.ts";

/** Every generated file, keyed by its path inside `.space/`. */
export const renderApp = (plan: AppPlan): Record<string, string> => ({
	"manifest.ts": renderManifest(plan),
	...Object.fromEntries(plan.db.map((db) => [`db/${db.name}.ts`, renderDb(db)])),
	...renderEntries(plan),
	"infra.ts": renderInfra(plan),
	"assets.d.ts": renderAssetTypes(plan),
	...renderIslands(plan),
	"vite.config.ts": renderViteConfig(),
});
