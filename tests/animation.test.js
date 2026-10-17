import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import WavePath from '../dist/index.js';

function mockGlobal(t, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  });
}

function mockFrames(t) {
  const callbacks = new Map();
  let nextId = 0;

  mockGlobal(t, 'requestAnimationFrame', (callback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  mockGlobal(t, 'cancelAnimationFrame', (id) => callbacks.delete(id));
  mockGlobal(t, 'crypto', undefined);
  t.mock.method(Math, 'random', () => 0.25);
  t.mock.method(performance, 'now', () => 0);

  return {
    frame(timestamp) {
      assert.equal(callbacks.size, 1, 'one animation frame should be scheduled');
      const pending = Array.from(callbacks.values());
      callbacks.clear();
      for (const callback of pending) callback(timestamp);
    },
    pendingCount() {
      return callbacks.size;
    },
  };
}

function createWave(isOpened = false, options = {}) {
  const paths = Array.from({ length: 3 }, () => {
    const attributes = new Map();
    return {
      setAttribute(name, value) {
        attributes.set(name, value);
      },
      getAttribute(name) {
        return attributes.get(name);
      },
    };
  });
  const wave = new WavePath({
    svgEl: { querySelectorAll: () => paths },
    duration: 1,
    delayPaths: 0.25,
    isOpened,
    ...options,
  });
  wave.init();

  return {
    wave,
    snapshot: () => paths.map((path) => path.getAttribute('d')),
  };
}

function assertEndpoint(paths, opened) {
  assert.ok(
    paths.every((path) => path === paths[0]),
    'all layers should reach the same endpoint',
  );
  assert.match(paths[0], /^M 0 0 C /);
  assert.ok(paths[0].endsWith(`V ${opened ? 100 : 0} H 0`));
}

for (const direction of ['open', 'close']) {
  test(`${direction} preserves the beginning after a delayed first frame and staggers layers`, async (t) => {
    const frames = mockFrames(t);
    const { wave, snapshot } = createWave(direction === 'close');
    const animation = wave[direction]();
    const initialPaths = snapshot();

    frames.frame(400);
    assert.deepEqual(
      snapshot(),
      initialPaths,
      'the first displayed frame should still be at progress 0',
    );

    frames.frame(500);
    const activeLayer = direction === 'open' ? 0 : 2;
    for (let index = 0; index < initialPaths.length; index++) {
      if (index === activeLayer) assert.notEqual(snapshot()[index], initialPaths[index]);
      else
        assert.equal(snapshot()[index], initialPaths[index], 'delayed layers should remain still');
    }

    frames.frame(400 + wave.totalDurationMs());
    await animation;
    assertEndpoint(snapshot(), direction === 'open');
    assert.equal(frames.pendingCount(), 0);
  });
}

test('duration and layer delays are measured from the first animation frame', async (t) => {
  const frames = mockFrames(t);
  const { wave, snapshot } = createWave();
  let completed = false;
  const animation = wave.open().then(() => {
    completed = true;
  });
  assert.equal(wave.totalDurationMs(), 1500);

  frames.frame(400);
  frames.frame(1500);
  await nextTurn();
  assert.equal(completed, false, 'time waiting for the first frame must not shorten the animation');

  frames.frame(1899);
  await nextTurn();
  assert.equal(completed, false, 'the last layer must receive its full duration');

  frames.frame(1900);
  await animation;
  assert.equal(completed, true);
  assertEndpoint(snapshot(), true);
  assert.equal(frames.pendingCount(), 0);
});

test('60, 120 and 144 Hz produce the same paths at the same elapsed times', async (t) => {
  const frames = mockFrames(t);

  for (const direction of ['open', 'close']) {
    const samplesByRate = [];
    for (const refreshRate of [60, 120, 144]) {
      const { wave, snapshot } = createWave(direction === 'close');
      const animation = wave[direction]();
      const samples = [];
      const frameCount = (wave.totalDurationMs() / 1000) * refreshRate;

      for (let index = 0; index <= frameCount; index++) {
        frames.frame((index * 1000) / refreshRate);
        if (index % (refreshRate / 4) === 0) samples.push(snapshot());
      }

      await animation;
      assertEndpoint(snapshot(), direction === 'open');
      assert.equal(frames.pendingCount(), 0);
      samplesByRate.push(samples);
    }

    assert.deepEqual(samplesByRate[1], samplesByRate[0], `${direction}: 120 Hz should match 60 Hz`);
    assert.deepEqual(samplesByRate[2], samplesByRate[0], `${direction}: 144 Hz should match 60 Hz`);
  }
});

test('zero duration and delays settle open and close without scheduling an animation frame', async (t) => {
  const frames = mockFrames(t);
  const { wave, snapshot } = createWave(false, { duration: 0, delayPaths: 0 });

  assert.equal(wave.totalDurationMs(), 0);
  for (const direction of ['open', 'close']) {
    const animation = wave[direction]();
    assert.equal(frames.pendingCount(), 0, `${direction} should not schedule an animation frame`);
    assertEndpoint(snapshot(), direction === 'open');
    assert.ok(snapshot().every((path) => !path.includes('NaN') && !path.includes('Infinity')));
    await animation;
  }
});
