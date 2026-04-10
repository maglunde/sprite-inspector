# Sprite Inspector

Sprite Inspector is a small React app for inspecting rectangular regions of an image. Upload, drag, paste, or fetch an image, then inspect the selected crop, dominant colors, average color, and per-pixel RGBA values directly in the browser.

## Features

- Upload local images or paste directly from the clipboard
- Drag and resize a bounded crop selection
- Inspect the cropped preview and copy `x, y, width, height` arguments
- View dominant colors, average color, and a pixel matrix for small selections
- Fetch large sample images from `picsum.photos` for quick testing

## Tech Stack

- React 18
- Vite 8
- Vitest
- Playwright

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- npm 10 or newer

## Getting Started

```bash
npm install
npm run dev
```

The dev server starts on the default Vite port unless you override it.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm test
npm run test:e2e
```

## Testing

Unit tests live in `src/test/` and end-to-end tests live in `tests/e2e/`.

```bash
npm test
npm run test:e2e
```

## Publishing Notes

This repository is intended to be public on GitHub, but the package itself remains `private` to avoid accidental publication to npm.

GitHub Pages deployment is configured through GitHub Actions. The Pages build uses the repository base path `/sprite-inspector/`, which matches the project site URL under `maglunde.github.io`.

## License

[MIT](./LICENSE)
