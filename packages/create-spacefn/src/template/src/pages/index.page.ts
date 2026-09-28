import { definePage } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

export default definePage<{ msg: string }>((data) =>
  h.html({}, h.body({}, h.main({}, h.h1({}, data.msg), h.p({}, "Welcome to your Space app")))),
);
