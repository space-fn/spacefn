import { defineMiddleware } from "spacefn";
import { csrfGuard } from "spacefn/auth";

/** Refuses cross-site changes made with a session cookie. Add trusted origins here. */
export default defineMiddleware(csrfGuard({ cookie: "session" }));
