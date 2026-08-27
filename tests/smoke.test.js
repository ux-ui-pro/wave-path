import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const expectedArtifacts = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.d.cts',
];

test('dist artifacts exist', () => {
  for (const artifact of expectedArtifacts) {
    assert.equal(existsSync(artifact), true, `${artifact} should exist`);
  }
});

test('public ESM API exports default class', async () => {
  const mod = await import('../dist/index.js');

  assert.equal(typeof mod.default, 'function');
});

test('public CJS API can be imported', async () => {
  const mod = await import('../dist/index.cjs');

  assert.equal(typeof mod.default, 'function');
});

test('wave profiles vary independently and retain subpixel precision', async () => {
  const { default: WavePath } = await import('../dist/index.js');
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalRandom = Math.random;
  const randomValues = [0, 0, 0, 0.25];

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: undefined,
  });
  Math.random = () => randomValues.shift() ?? 0;

  try {
    const atMax = new WavePath({ svgEl: {}, numberPoints: 32 });
    const overMax = new WavePath({ svgEl: {}, numberPoints: 33 });
    assert.equal(atMax.pointCount, 32);
    assert.equal(overMax.pointCount, 32);

    const wavePath = new WavePath({ svgEl: {}, numberPoints: 4 });

    wavePath.rollWaveProfile();
    const firstProfile = Array.from(wavePath.baseWave);

    wavePath.rollWaveProfile();
    const secondProfile = Array.from(wavePath.baseWave);

    assert.notDeepEqual(firstProfile, secondProfile);
    assert.ok(secondProfile.every((value) => Math.abs(value) <= 1));
    assert.equal(WavePath.fmtY(12.346), '12.35');
  } finally {
    Math.random = originalRandom;
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});
