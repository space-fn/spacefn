---
title: public/
icon: world-www
---

# public/

Files served as they are, at the app's root URL: `public/favicon.svg` is `/favicon.svg`, `public/images/og.png` is `/images/og.png`. They're copied into the build unchanged, without hashed names.

```txt
public/
├── favicon.svg            /favicon.svg
├── robots.txt             /robots.txt
└── images/
    └── og.png             /images/og.png
```

On both targets they're answered before the app runs: by Cloudflare's assets on Cloudflare, by `staticFiles()` in the entry on Bun. So a public file at a route's URL would hide the route, and `space gen` stops with `PUBLIC_SHADOWS_ROUTE` instead. An HTML file counts at its clean URL too: `about.html` is also `/about`.

Use it for files that need a fixed URL: icons, `robots.txt`, `.well-known/` files, images linked from elsewhere. Import everything else from [`app/client/`](1-app/6-client.md), so it gets a hashed name and caches safely:

```html
<link rel="icon" href="/favicon.svg" />
```
