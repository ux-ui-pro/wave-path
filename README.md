# wave-path

A lightweight library for multi-layered SVG overlays with animated open/close transitions.

[![npm](https://img.shields.io/npm/v/wave-path.svg?colorB=brightgreen)](https://www.npmjs.com/package/wave-path)
[![NPM Downloads](https://img.shields.io/npm/dm/wave-path.svg?style=flat)](https://www.npmjs.com/package/wave-path)

[Demo](https://codepen.io/ux-ui/pen/Jjervqg)

---

- Smooth cubic-bezier wave edges via animated SVG `d` attributes.
- Multiple layered `<path>` elements with configurable delay between layers.
- Typed arrays and reused string buffers for low-allocation rendering.

---

## Installation

```bash
npm install wave-path
```

## Quick Start

```ts
import WavePath from 'wave-path';

const wavePath = new WavePath({
  svgEl: '.svg',
  isOpened: false,
  numberPoints: 6,
  waveAmplitude: 30,
  delayPaths: 0.25,
  duration: 1.5,
});

wavePath.init();

await wavePath.open();
await wavePath.close();
await wavePath.toggle();
```

## API

```ts
import WavePath from 'wave-path';
import type { WavePathOptions } from 'wave-path';
```

- `WavePath` — main class (default export).
- `WavePathOptions` — constructor options type.

## Options

| Option          | Type                   | Default    | Description |
|:----------------|:-----------------------|:-----------|:------------|
| `svgEl`         | `string \| SVGElement` | —          | **Required.** SVG container selector or element node. |
| `pathEl`        | `string`               | `'path'`   | Selector for `<path>` elements inside the SVG. All matched paths are animated as layers. |
| `numberPoints`  | `number`               | `4`        | Number of wave control points (clamped to **3..8**). Higher values give a more detailed edge. |
| `waveAmplitude` | `number`               | `30`       | Wave ripple amplitude (clamped to **0..100**). Set `0` for a straight edge animation. |
| `delayPaths`    | `number`               | `0.25`     | Delay between animations of each path layer (seconds). |
| `duration`      | `number`               | `1`        | Duration of each path layer animation (seconds). |
| `isOpened`      | `boolean`              | `false`    | Initial state. Use `open()`, `close()`, or `toggle()` at runtime. |

## Methods

```ts
wavePath.init();
await wavePath.toggle();
await wavePath.open();
await wavePath.close();
wavePath.totalDurationMs();
wavePath.stopIfActive();
wavePath.destroy();
```

- `init()` — resolves DOM references, allocates internal buffers, and sets a stable initial shape based on `isOpened`. Safe to call again if the SVG content changes.
- `toggle()` — toggles between opened/closed. Returns a `Promise<void>` resolved on animation complete.
- `open()` — opens the overlay. Returns a `Promise<void>` resolved on animation complete.
- `close()` — closes the overlay. Returns a `Promise<void>` resolved on animation complete.
- `totalDurationMs()` — returns total duration of the current animation in **milliseconds** (includes `delayPaths`). Call after `init()` so `pathCount` is known.
- `stopIfActive()` — stops the current animation if active. Useful for cancelling or resetting animations.
- `destroy()` — cancels animations, clears references and caches; safe to call multiple times.
- `isOpened` (getter) — current logical state of the overlay (`boolean`).

## License

MIT
