import { serve } from "../../../src/bun/index.ts";
import app from "./app.ts";

await serve(app, { client: new URL("client", import.meta.url).pathname });
