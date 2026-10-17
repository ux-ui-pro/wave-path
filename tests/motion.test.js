import assert from 'node:assert/strict';
import test from 'node:test';
import WavePath from '../dist/index.js';

function createWave(amplitude, profile) {
  const wave = new WavePath({
    svgEl: {},
    numberPoints: profile.length,
    waveAmplitude: amplitude,
    duration: 1.25,
  });
  wave.baseWave.set(profile);
  return wave;
}

function positionsAt(wave, progress) {
  // Keep rounding out of the numerical velocity measurement.
  const positions = new Float64Array(wave.pointCount);
  wave.fillWaveAtProgress(positions, progress);
  return positions;
}

test('wave velocity stays continuous when opposite bounds exchange control', () => {
  const profiles = [
    { values: [0, 0.6, 0.8, -0.8, -0.6, 0], crossing: 0.5 },
    {
      values: [0, 0.6, 0.8, -0.4, -0.2, 0],
      crossing: 1 - 0.5 * (2 / 3) ** (1 / 1.6),
    },
  ];
  const step = 0.00001;

  for (const amplitude of [0, 30, 90, 100]) {
    for (const { values, crossing } of profiles) {
      const wave = createWave(amplitude, values);
      const before = positionsAt(wave, crossing - step);
      const atCrossing = positionsAt(wave, crossing);
      const after = positionsAt(wave, crossing + step);

      for (let i = 0; i < values.length; i++) {
        const leftVelocity = (atCrossing[i] - before[i]) / step;
        const rightVelocity = (after[i] - atCrossing[i]) / step;
        assert.ok(
          Math.abs(leftVelocity - rightVelocity) < 0.1,
          `amplitude ${amplitude}, crossing ${crossing}, point ${i}: velocity jumped from ${leftVelocity} to ${rightVelocity}`,
        );
      }
    }
  }
});

test('wave positions reach endpoints and stay inside the overlay', () => {
  for (const pointCount of [6, 32]) {
    const alternating = Array.from({ length: pointCount }, (_, i) => {
      if (i === 0 || i === pointCount - 1) return 0;
      return i % 2 === 0 ? 1 : -1;
    });
    const profiles = [
      alternating,
      alternating.map(Math.abs),
      alternating.map((value) => -Math.abs(value)),
      new Array(pointCount).fill(0),
    ];

    for (const amplitude of [0, 30, 90, 100]) {
      for (const profile of profiles) {
        const wave = createWave(amplitude, profile);
        assert.ok(positionsAt(wave, 0).every((value) => value === 100));
        assert.ok(positionsAt(wave, 1).every((value) => Math.abs(value) < 1e-10));

        for (let frame = 1; frame < 120; frame++) {
          const positions = positionsAt(wave, frame / 120);
          assert.ok(
            positions.every((value) => Number.isFinite(value) && value >= 0 && value <= 100),
            `amplitude ${amplitude}, ${pointCount} points, frame ${frame}: invalid positions`,
          );
          if (amplitude === 0) {
            assert.ok(positions.every((value) => value === positions[0]));
          }
        }
      }
    }
  }
});
