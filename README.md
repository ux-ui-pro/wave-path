<div align="center">
<br>

<h1>wave-path</h1>

<p><sup>wave-path is a lightweight library for creating multi-layered SVG overlays with animated transitions. It is ideal for dynamic scene transitions in SPAs or animated menu effects. The animation is fully customizable, allowing you to adjust timing, easing, and shape behavior.</sup></p>

[![npm](https://img.shields.io/npm/v/wave-path.svg?colorB=brightgreen)](https://www.npmjs.com/package/wave-path)
[![GitHub package version](https://img.shields.io/github/package-json/v/ux-ui-pro/wave-path.svg)](https://github.com/ux-ui-pro/wave-path)
[![NPM Downloads](https://img.shields.io/npm/dm/wave-path.svg?style=flat)](https://www.npmjs.org/package/wave-path)

<sup>~1.7kB gzipped</sup>

<a href="https://codepen.io/ux-ui/full/Jjervqg">Demo</a>

</div>

<br>

➠ **Install**
```console
yarn add gsap
yarn add wave-path
```

<br>

➠ **Import**
```ts
import gsap from 'gsap';
import WavePath from 'wave-path';
```

<br>

➠ **Usage**
```ts
const wavePath = new WavePath({
  svgEl: '.svg',         // required: SVG element or selector
  // pathEl: 'path',     // optional: selector for <path> inside the SVG, defaults to 'path'
  ease: 'power1.inOut',
  isOpened: false,
  numberPoints: 6,
  delayPoints: 0.3,
  delayPaths: 0.25,
  duration: 1.5,
});

wavePath.init();

// later
await wavePath.open();
await wavePath.close();
await wavePath.toggle();

// helper info
console.log(wavePath.isOpened);            // boolean
console.log(wavePath.totalDurationMs());   // number in ms
wavePath.stopIfActive();                   // kill active timeline if any
```

<br>

➠ **Options**

| Option         |              Type               | Default     | Description                                                                                   |
|:---------------|:-------------------------------:|:-----------:|:----------------------------------------------------------------------------------------------|
| `svgEl`        |  `string` &#124; `SVGElement`   | **required**| **Required.** SVG container selector or element node.                                         |
| `pathEl`       |            `string`             |   `'path'`  | Selector for the `<path>` elements inside the SVG container.                                  |
| `numberPoints` |            `number`             |     `4`     | Number of animation points on each path (min `2`).                                            |
| `delayPoints`  |            `number`             |    `0.3`    | Max random delay per point.                                                                   |
| `delayPaths`   |            `number`             |    `0.25`   | Delay between animation of each path.                                                         |
| `duration`     |            `number`             |     `1`     | Duration of point animation segment (seconds).                                                |
| `ease`         | `string` &#124; `(t:number)=>number` | `'none'` | Timing function: GSAP ease name (e.g., `'power1.inOut'`) or a custom easing function.         |
| `isOpened`     |           `boolean`             |   `false`   | Initial state. Use `open()`, `close()`, or `toggle()` to change it at runtime.                |

<br>

➠ **API**

| Member / Method         | Description                                                                                             |
|:------------------------|:--------------------------------------------------------------------------------------------------------|
| `init()`                | Initializes the overlay with the given options. Idempotent.                                             |
| `toggle()`              | Toggles between opened/closed. Returns a `Promise<void>` resolved on animation complete.                |
| `open()`                | Opens the overlay. Returns a `Promise<void>` resolved on animation complete.                            |
| `close()`               | Closes the overlay. Returns a `Promise<void>` resolved on animation complete.                           |
| `totalDurationMs()`     | Returns the total duration of the current timeline in **milliseconds**.                                 |
| `stopIfActive()`        | Stops the current animation timeline if active. Useful for cancelling or resetting animations.          |
| `destroy()`             | Cleans up all callbacks, tweens, and timeline; safe to call multiple times.                             |
| `isOpened` (getter)     | Current logical state of the overlay (`boolean`).                                                       |

<br>

➠ **Notes**

- **Peer dependency:** `gsap` >= `3.12.0`. Install GSAP in your project alongside `wave-path`.
- **Module formats:** ships both ESM and CJS builds; TypeScript definitions included.
- **Rendering:** the library updates `d` attributes of SVG `<path>` elements to produce smooth multi-segment bezier wave transitions.

<br>

➠ **License**

wave-path is released under the MIT license.
