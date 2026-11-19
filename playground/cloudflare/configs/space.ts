import { defineSpace } from "spacefn/config";

// The app's name comes from package.json. See the docs for aliases and database drivers.
export default defineSpace({ target: "cloudflare" });
