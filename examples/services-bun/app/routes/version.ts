import { Effect } from "effect";
import { route } from "spacefn";

// The dev test edits this text, to see the edit served on the next request.
export default route({ GET: Effect.succeed("v1") });
