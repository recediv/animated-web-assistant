# animated-web-assistant

[Русский](README.md) · English

An animated website assistant. The character moves around the page, reacts to user actions, and interacts with the interface.

[Demo](https://recediv.github.io/animated-web-assistant/)

## Run locally

Requires Node.js 22.16 or later in the 22.x series.

```sh
npm ci
npm run dev
```

## Build and integration

```sh
npm run build
```

The demo site is built into `dist/`. Assistant builds and assets are in `dist/assistant/1.0.0/`. Available as an ES module or a `<script>` build.

To use it on your site, provide a [configuration](demo/assistant.config.json) and a [ShopAdapter](src/config/types.ts). Initialize it with `init({ configUrl, adapter })`. The scene menu and page transition animations are implemented in the demo site.

## Checks

```sh
npm test
npm run typecheck
npm run lint
```

## Author and license

© 2026 **Shutnic[mz]**.

Licensed under [GNU GPL version 3 or any later version](LICENSE) (`GPL-3.0-or-later`).

The [Neucha](assets/fonts/Neucha-OFL.txt) and [Nunito](assets/fonts/Nunito-OFL.txt) fonts are licensed under SIL OFL 1.1.
