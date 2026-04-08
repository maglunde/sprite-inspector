# Sprite Inspector — Agent Guide

## Project overview

Sprite Inspector is a single-page React app (Vite) for inspecting rectangular regions of images. Users upload or paste an image, set x/y/width/height, and see the cropped region, dominant colors, average color, and per-pixel RGBA values.

## Tech stack

- **React 18** with hooks — no state management library
- **Vite** for dev server and bundling
- **Vitest** for unit tests (`src/test/`)
- **Playwright** for end-to-end tests (`tests/e2e/`)

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (output: dist/)
npm test             # Run unit tests (vitest)
npm run test:e2e     # Run Playwright e2e tests
```

## Code structure

```
src/
  App.jsx            # Entire application — single component + helpers
  main.jsx           # React entry point
  styles.css         # All styles
  test/
    App.test.jsx     # Unit tests
    setup.js         # Vitest setup (jest-dom)
tests/
  e2e/               # Playwright tests
index.html
vite.config.js
playwright.config.js
```

## Key architecture notes

- All logic lives in `App.jsx` — no separate components or modules.
- `boundedSelection` (memoized) clamps the raw `selection` state to image bounds. Use this when reading coordinates, not raw `selection`.
- `normalizeSelection` enforces integer coordinates and clamping. Call this before any `setSelection`.
- Image pixel data flows through a hidden `<canvas>` (`sourceCanvasRef`) — the `<img>` element is only for display and natural-size detection.
- Drag and resize use pointer capture (`setPointerCapture`) tracked via `interactionRef`.
- Random images are fetched from `picsum.photos`. Stale-request races are handled by `randomRequestIdRef`.

## Patterns to follow

- Keep all application logic in `App.jsx`. Do not split into sub-components unless the change explicitly calls for it.
- Use `normalizeSelection` for every `setSelection` call that takes user input or pointer coordinates.
- Do not add dependencies without a clear reason — the project is intentionally lean.
- Tests use `@testing-library/react` and `@testing-library/user-event`. Mirror that style for new tests.
