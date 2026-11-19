// Node-only: scans the app, checks it and writes `.space/`. Used by the `space` CLI.
export { gen } from "./gen.ts";
export { watchGen } from "./watch.ts";
export { loadSpaceConfig, SPACE_CONFIG_FILE } from "./load-space-config.ts";
export type { Mode } from "./route-path.ts";
export type { WriteResult } from "./write.ts";
