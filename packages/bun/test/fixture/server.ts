import { serve } from "../../src/index.ts";
import app from "./app.ts";

await serve(app, { client: new URL("client", import.meta.url).pathname });
