import { Effect } from "effect";
import { route } from "spacefn";

export default route({ GET: Effect.succeed("v1") });
