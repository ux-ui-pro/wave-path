<div align="center">
<br>

<h1>wave-path</h1>

<p><sup>wave-path is a lightweight library for creating multi-layered SVG overlays with animated open/close transitions. It is ideal for scene transitions in SPAs or animated menu effects. The library updates SVG <code>d</code> attributes to generate smooth cubic bezier wave edges, and supports multiple layered <code>&lt;path&gt;</code> elements animated with a configurable delay.</sup></p>

[![npm](https://img.shields.io/npm/v/wave-path.svg?colorB=brightgreen)](https://www.npmjs.com/package/wave-path)
[![GitHub package version](https://img.shields.io/github/package-json/v/ux-ui-pro/wave-path.svg)](https://github.com/ux-ui-pro/wave-path)
[![NPM Downloads](https://img.shields.io/npm/dm/wave-path.svg?style=flat)](https://www.npmjs.org/package/wave-path)

<sup>~2kB gzipped (library code; excluding dependencies)</sup>

<a href="https://codepen.io/ux-ui/pen/Jjervqg">Demo</a>

</div>

<br>

➠ **Install**
```console
yarn add wave-path
```

<br>

➠ **Import**
```ts
import WavePath from 'wave-path';
```

<br>

➠ **Usage**
```ts
const wavePath = new WavePath({
  svgEl: '.svg',       // required: SVGElement or selector
  // pathEl: 'path',   // optional: selector for <path> inside the SVG, defaults to 'path'
  isOpened: false,     // initial state

  numberPoints: 6,     // 3..8 (default 4)
  waveAmplitude: 30,   // 0..100 (default 30)

  delayPaths: 0.25,    // seconds between each <path> layer (default 0.25)
  duration: 1.5,       // seconds per layer animation (default 1)
});

wavePath.init();

// later
await wavePath.open();
await wavePath.close();
await wavePath.toggle();

// helper info
console.log(wavePath.isOpened);            // boolean
console.log(wavePath.totalDurationMs());   // number in ms
wavePath.stopIfActive();                   // kill active animation if any
```

<br>

➠ **Options**

| Option          | Type                   |   Default    | Description                                                                                           |
|:----------------|:-----------------------|:------------:|:------------------------------------------------------------------------------------------------------|
| `svgEl`         | `string \| SVGElement` | **required** | **Required.** SVG container selector or element node.                                                 |
| `pathEl`        | `string`               |   `'path'`   | Selector for the `<path>` elements inside the SVG container. All matched paths are treated as layers. |
| `numberPoints`  | `number`               |     `4`      | Number of wave control points (clamped to **3..8**). Higher values give a more detailed edge.         |
| `waveAmplitude` | `number`               |     `30`     | Wave ripple amplitude (clamped to **0..100**). Set `0` for a straight edge animation.                 |
| `delayPaths`    | `number`               |    `0.25`    | Delay between animations of each path layer (seconds).                                                |
| `duration`      | `number`               |     `1`      | Duration of each path layer animation (seconds).                                                      |
| `isOpened`      | `boolean`              |   `false`    | Initial state. Use `open()`, `close()`, or `toggle()` at runtime.                                     |

<br>

➠ **API**

| Member / Method     | Description                                                                                                                                              |
|:--------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------|
| `init()`            | Resolves DOM references, allocates internal buffers, and sets a stable initial shape based on `isOpened`. Safe to call again if the SVG content changes. |
| `toggle()`          | Toggles between opened/closed. Returns a `Promise<void>` resolved on animation complete.                                                                 |
| `open()`            | Opens the overlay. Returns a `Promise<void>` resolved on animation complete.                                                                             |
| `close()`           | Closes the overlay. Returns a `Promise<void>` resolved on animation complete.                                                                            |
| `totalDurationMs()` | Returns total duration of the current animation in **milliseconds** (includes `delayPaths`). Call after `init()` so `pathCount` is known.                |
| `stopIfActive()`    | Stops the current animation if active. Useful for cancelling or resetting animations.                                                                    |
| `destroy()`         | Cancels animations, clears references and caches; safe to call multiple times.                                                                           |
| `isOpened` (getter) | Current logical state of the overlay (`boolean`).                                                                                                        |

<br>

➠ **Notes**
- **Layering:** if your SVG contains multiple `<path>` nodes matching `pathEl`, each path is animated as a layer with `delayPaths` between layers.
- **Rendering:** the library updates `d` attributes of SVG `<path>` elements to produce smooth multi-segment cubic bezier wave transitions.
- **Performance:** the implementation uses typed arrays and reuses string buffers to reduce allocations.

<br>

➠ **License**

wave-path is released under the MIT license.
