# Contributing

Thanks for helping make roof estimating free.

## Setup

```bash
pnpm install
pnpm test          # engine tests
pnpm typecheck
pnpm dev           # web app at http://localhost:5173
```

## Where things live

- `packages/core` is the engine. It has no dependencies and must stay that way so it can run anywhere (browser, Node, a CLI, a worker). Every public function gets a test in `packages/core/test`.
- `apps/web` is the UI. State lives in `src/state.ts` (a reducer), the map in `src/MapView.tsx`, panels in `src/panels/`.

## Guidelines

- **Show the math.** Any new takeoff or pricing line needs a human-readable `formula` string. Roofers will check it.
- **Defaults are placeholders.** Coverage numbers and prices in `DEFAULT_*` should be realistic but are not authoritative. Cite a source in a comment when you change one.
- **Keep the model simple.** The JSON roof model is the contract. Changing it means bumping `MODEL_SCHEMA_VERSION` and handling old files in `parseModel`.
- **Imperial first, metric soon.** Internally everything is feet and square feet for now. Don't mix units in the engine.

## Pull requests

- One feature per PR.
- Run `pnpm test && pnpm typecheck && pnpm build` before opening.
- For anything affecting measurements, include a test with a known-good answer (a rectangle you can compute by hand, a published pitch factor, etc.).

## Reporting measurement bugs

Export the roof as JSON (Export button) and attach it to the issue along with what you expected. That file is all we need to reproduce.
