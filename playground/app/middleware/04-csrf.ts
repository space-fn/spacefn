import { csrfGuard } from "spacefn/auth";
import { defineMiddleware } from "spacefn/middleware";

/** Refuses cross-site changes made with a session cookie. Add trusted origins here. */
export default defineMiddleware(csrfGuard({ cookie: "session", origins: [] }));
