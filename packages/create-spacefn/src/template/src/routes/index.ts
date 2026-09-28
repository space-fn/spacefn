import { h, render } from "@spacefn/asteroids";

export default function GET() {
  return new Response(
    render(
      h.html(
        {},
        h.head({}, h.title({}, "Home")),
        h.body({}, h.main({}, h.h1({}, "Hello from Space"), h.p({}, "Your app is running."))),
      ),
    ),
    { headers: { "content-type": "text/html" } },
  );
}
