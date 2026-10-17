import { defineMiddleware } from "spacefn";

export default defineMiddleware(async (c, next) => {
	await next();
	c.res.headers.set("x-powered-by", "spacefn");
});
