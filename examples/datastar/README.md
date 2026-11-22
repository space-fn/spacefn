# datastar

A live poll with [Datastar](https://data-star.dev), on Cloudflare: vote in one tab and the results move in every open tab.

```sh
pnpm dev    # alchemy dev
pnpm test
```

What it shows:

- **Components** are functions from plain props to `html`, in `modules/poll/views.ts`. One that Datastar patches has a fixed `id`, exported beside it (`results.id`), so the page and the live updates can't drift apart.
- **Signals** live under the feature's name: `data-signals="{poll: {choice: '', voted: ''}}"`, read as `$poll.choice`. Two features on one page don't collide.
- **Actions**: the ballot's buttons `@post` the signals to the page's `vote` action, which decodes them with a Schema and answers with `Datastar.patchSignals`. The `live` action keeps the results current with `Datastar.watch` over the Bus.
- **Custom elements** with Rocket, Datastar's web component API: `<poll-meter>` in `modules/poll/client/poll-meter.ts`, registered by the `app/assets/main.ts` entry. Rocket is in beta and comes in the `datastar-rocket.js` bundle, which this example loads from the CDN in place of `datastar.js`; nothing of it is copied into the app. `lib/types/rocket.d.ts` types that import for every component in the app. Check its license before you ship it.

`app/` only wires: the page connects `modules/poll/`, and `lib/ui/` has the layout and base styles.
