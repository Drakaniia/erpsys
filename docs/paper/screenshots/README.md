# System screenshots

Eleven desktop PNGs illustrate the main pages in `../CODE_ARTIFACTS_SCREENSHOTS.md`, section 4. File prefixes match its existing figure numbers. Figure 65 has two views of the same administrator dashboard. Remaining document placeholders are deliberately not presented as captured screens.

All screenshots use fictional records supplied by the existing film adapters plus capture-only officer overview fixtures. No database, real account, uploaded evidence, or credentials were used. The captures render the real React page components, not a static recreation. They demonstrate appearance, not live backend or authentication correctness.

## Reproduce

From the repository root, with dependencies installed:

```sh
pnpm --filter web exec node film/capture-paper.mjs
```

For one figure:

```sh
pnpm --filter web exec node film/capture-paper.mjs 65-admin-overview
```

Capture setup: `apps/web/film/paper.tsx`, `paper-models.ts`, `paper-assets.cjs`, and `apps/web/paper.config.ts`. Production Vite configuration and live services are untouched. Captures wait six seconds for fonts, image decoding, and chart animations. Inspect the PNGs after regeneration: overview bars, rings, and area charts must be populated before accepting the outputs.

All supplied images are 1440 × 900, light theme, PNG, under 300 KB, with no browser chrome or pointer. Phone views are intentionally excluded. The Markdown document is updated; its previously generated Word/PDF copies have not been rebuilt.
