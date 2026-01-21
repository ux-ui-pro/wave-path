export interface WavePathOptions {
  svgEl: string | SVGElement;
  pathEl?: string;
  numberPoints?: number;
  waveAmplitude?: number;
  delayPaths?: number;
  duration?: number;
  isOpened?: boolean;
}

type NormalizedOptions = Readonly<{
  svgEl: string | SVGElement;
  pathEl: string;
  numberPoints: number;
  waveAmplitude: number;
  delayPaths: number;
  duration: number;
  isOpened: boolean;
}>;

const PERCENT_MIN = 0;
const PERCENT_MAX = 100;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clamp01(n: number): number {
  return n <= 0 ? 0 : n >= 1 ? 1 : n;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutPow(t: number, k: number): number {
  const x = clamp01(t);
  if (x < 0.5) return 0.5 * Math.pow(2 * x, k);
  return 1 - 0.5 * Math.pow(2 * (1 - x), k);
}

function easeInOutCos(t: number): number {
  const x = clamp01(t);
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

function bellCurve(t: number, shape = 1): number {
  const x = clamp01(t);
  const b = Math.sin(Math.PI * x);
  return shape === 1 ? b : Math.pow(b, shape);
}

function random01(): number {
  try {
    const g: unknown = globalThis as unknown;
    const cryptoObj = (g as { crypto?: Crypto }).crypto;

    if (cryptoObj?.getRandomValues) {
      const a = new Uint32Array(1);
      cryptoObj.getRandomValues(a);
      return (a[0] >>> 0) / 4294967296;
    }
  } catch {
    // ignore
  }

  return Math.random();
}

function normalizeOptions(opts: WavePathOptions): NormalizedOptions {
  const numberPoints = clamp(opts.numberPoints ?? 4, 3, 8);
  const waveAmplitude = clamp(opts.waveAmplitude ?? 30, 0, 100);

  return {
    svgEl: opts.svgEl,
    pathEl: opts.pathEl ?? 'path',
    numberPoints,
    waveAmplitude,
    delayPaths: opts.delayPaths ?? 0.25,
    duration: opts.duration ?? 1,
    isOpened: opts.isOpened ?? false,
  };
}

export default class WavePath {
  private static readonly ENV_POWER = 0.5;
  private static readonly RIPPLE_FREQ = 2;
  private static readonly RIPPLE_GAIN = 0.5;

  private static readonly LIFT_EASE_POW = 1.6;
  private static readonly BELL_SHAPE = 0.85;
  private static readonly RIPPLE_SHIFT = 0.0;

  private readonly svgRef: string | SVGElement;
  private readonly pathSelector: string;

  private readonly pointCount: number;
  private readonly pathDelay: number;
  private readonly durationSec: number;
  private readonly amplitude: number;

  private svg: SVGElement | null = null;
  private pathEls: SVGPathElement[] = [];
  private pathCount = 0;

  private segmentCount = 0;
  private segmentStep = 0;
  private pPositions: string[] = [];
  private cpPositions: string[] = [];

  private readonly dParts: string[] = [];
  private readonly pointStrings: string[] = [];
  private prevPathD: string[] = [];

  private yBuffers: Float32Array[] = [];
  private tValues: Float32Array = new Float32Array(0);
  private envValues: Float32Array = new Float32Array(0);
  private baseWave: Float32Array = new Float32Array(0);
  private readonly flatTopPoints: Float32Array;

  private isOpenState: boolean;

  private rafId: number | null = null;
  private animToken = 0;

  constructor(opts: WavePathOptions) {
    const o = normalizeOptions(opts);

    this.svgRef = o.svgEl;
    this.pathSelector = o.pathEl;

    this.pointCount = o.numberPoints;
    this.pathDelay = o.delayPaths;
    this.durationSec = o.duration;
    this.amplitude = o.waveAmplitude;

    this.isOpenState = o.isOpened;

    this.flatTopPoints = new Float32Array(this.pointCount);

    this.computeSegmentParams();
    this.computePointParams();
  }

  public get isOpened(): boolean {
    return this.isOpenState;
  }

  public init(): void {
    this.svg =
      typeof this.svgRef === 'string'
        ? document.querySelector<SVGElement>(this.svgRef)
        : (this.svgRef ?? null);

    if (!this.svg) {
      this.resetDomRefs();
      this.cancelAnim();
      return;
    }

    this.pathEls = Array.from(this.svg.querySelectorAll<SVGPathElement>(this.pathSelector));
    this.pathCount = this.pathEls.length;

    this.cancelAnim();

    if (this.pathCount === 0) {
      this.resetDomRefs();
      return;
    }

    this.allocateCaches();
    const stableD = this.buildCubicPath(this.flatTopPoints, this.isOpenState);
    for (let i = 0; i < this.pathCount; i++) this.setPathD(i, stableD);
  }

  public async open(): Promise<void> {
    if (this.isAnimating()) return;
    this.isOpenState = true;
    await this.playProgress(true);
  }

  public async close(): Promise<void> {
    if (this.isAnimating()) return;
    this.isOpenState = false;
    await this.playProgress(false);
  }

  public async toggle(): Promise<void> {
    if (this.isAnimating()) return;
    this.isOpenState = !this.isOpenState;
    await this.playProgress(this.isOpenState);
  }

  public totalDurationMs(): number {
    return Math.round((this.durationSec + this.pathDelay * (this.pathCount - 1)) * 1000);
  }

  public stopIfActive(): void {
    this.cancelAnim();
  }

  public destroy(): void {
    this.cancelAnim();
    this.resetDomRefs();
    this.resetCaches();
  }

  private isAnimating(): boolean {
    return this.rafId != null;
  }

  private cancelAnim(): void {
    this.animToken++;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private resetDomRefs(): void {
    this.svg = null;
    this.pathEls = [];
    this.pathCount = 0;
    this.prevPathD = [];
  }

  private resetCaches(): void {
    this.yBuffers = [];
    this.baseWave = new Float32Array(0);
  }

  private allocateCaches(): void {
    this.yBuffers = new Array(this.pathCount);
    this.prevPathD = new Array(this.pathCount);

    for (let i = 0; i < this.pathCount; i++) {
      this.yBuffers[i] = new Float32Array(this.pointCount);
      this.prevPathD[i] = '';
    }
  }

  private setPathD(i: number, d: string): void {
    if (this.prevPathD[i] === d) return;
    this.pathEls[i].setAttribute('d', d);
    this.prevPathD[i] = d;
  }

  private computeSegmentParams(): void {
    this.segmentCount = Math.max(1, this.pointCount - 1);
    this.segmentStep = PERCENT_MAX / this.segmentCount;

    this.pPositions = new Array(this.segmentCount);
    this.cpPositions = new Array(this.segmentCount);

    for (let j = 0; j < this.segmentCount; j++) {
      const pVal = (j + 1) * this.segmentStep;
      const cpVal = pVal - this.segmentStep / 2;

      this.pPositions[j] = WavePath.fmt(pVal);
      this.cpPositions[j] = WavePath.fmt(cpVal);
    }
  }

  private computePointParams(): void {
    const n = this.pointCount;

    this.tValues = new Float32Array(n);
    this.envValues = new Float32Array(n);
    this.baseWave = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      this.tValues[i] = t;

      const envRaw = 1 - Math.abs(2 * t - 1);
      this.envValues[i] = envRaw ** WavePath.ENV_POWER;
      this.baseWave[i] = 0;
    }
  }

  private static fmt(n: number): string {
    const v = Math.round(n * 10) / 10;
    const iv = v | 0;
    return v === iv ? String(iv) : String(v);
  }

  private static fmtY(n: number): string {
    const v = Math.round(n * 10) / 10;
    const iv = v | 0;
    return v === iv ? String(iv) : String(v);
  }

  private static motionProfile(p: number): { pos: number; bell: number } {
    const t = clamp01(p);

    const pos = easeInOutPow(t, WavePath.LIFT_EASE_POW);

    const rippleT = easeInOutCos(clamp01(t + WavePath.RIPPLE_SHIFT));
    const bell = bellCurve(rippleT, WavePath.BELL_SHAPE);

    return { pos, bell };
  }

  private rollWaveProfile(): void {
    const phase = random01() * Math.PI * 2;
    const n = this.pointCount;
    const FREQ = WavePath.RIPPLE_FREQ;

    for (let i = 0; i < n; i++) {
      this.baseWave[i] = Math.sin(this.tValues[i] * Math.PI * FREQ + phase) * this.envValues[i];
    }
  }

  private fillWaveAtProgress(out: Float32Array, p: number): void {
    const pp = p <= 0 ? 0 : p >= 1 ? 1 : p;
    const { pos, bell } = WavePath.motionProfile(pp);

    const lift = lerp(PERCENT_MAX, PERCENT_MIN, pos);
    let rippleFactor = this.amplitude * WavePath.RIPPLE_GAIN * bell;

    const maxUp = PERCENT_MAX - lift;
    const maxDown = lift - PERCENT_MIN;

    let limit = Infinity;

    for (let i = 0; i < this.pointCount; i++) {
      const b = this.baseWave[i];
      if (b === 0) continue;

      const localLimit = b > 0 ? maxUp / b : maxDown / -b;
      if (localLimit < limit) limit = localLimit;
    }

    if (Number.isFinite(limit)) {
      rippleFactor = Math.min(rippleFactor, Math.max(0, limit * 0.98));
    }

    for (let i = 0; i < this.pointCount; i++) {
      const y = lift + this.baseWave[i] * rippleFactor;
      out[i] = clamp(y, PERCENT_MIN, PERCENT_MAX);
    }
  }

  private buildCubicPath(y: Float32Array, opened: boolean): string {
    const { cpPositions, pPositions, segmentCount, dParts, pointStrings } = this;

    pointStrings.length = this.pointCount;
    for (let j = 0; j < this.pointCount; j++) {
      pointStrings[j] = WavePath.fmtY(y[j]);
    }

    dParts.length = 0;
    dParts.push(
      'M',
      '0',
      pointStrings[0],
      'C',
      cpPositions[0],
      pointStrings[0],
      cpPositions[0],
      pointStrings[1],
      pPositions[0],
      pointStrings[1],
    );

    for (let j = 1; j < segmentCount; j++) {
      dParts.push('S', cpPositions[j], pointStrings[j + 1], pPositions[j], pointStrings[j + 1]);
    }

    dParts.push('V', opened ? '100' : '0', 'H', '0');
    return dParts.join(' ');
  }

  private async playProgress(opened: boolean): Promise<void> {
    if (!this.svg || this.pathCount === 0) return;

    this.cancelAnim();
    this.rollWaveProfile();

    const total = this.durationSec + this.pathDelay * (this.pathCount - 1);
    const totalMs = total * 1000;

    const token = ++this.animToken;
    const start = performance.now();

    const renderAt = (globalP: number): void => {
      const tNow = clamp01(globalP) * total;

      for (let i = 0; i < this.pathCount; i++) {
        const layerIndex = opened ? i : this.pathCount - i - 1;
        const layerDelay = this.pathDelay * layerIndex;

        const localP = clamp01((tNow - layerDelay) / this.durationSec);

        const y = this.yBuffers[i];
        this.fillWaveAtProgress(y, localP);

        const d = this.buildCubicPath(y, opened);
        this.setPathD(i, d);
      }
    };

    renderAt(0);

    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (token !== this.animToken) return;

        const elapsed = now - start;
        const p = elapsed / totalMs;

        renderAt(p);

        if (p >= 1) {
          this.rafId = null;

          const stableD = this.buildCubicPath(this.flatTopPoints, opened);
          for (let i = 0; i < this.pathCount; i++) this.setPathD(i, stableD);

          resolve();
          return;
        }

        this.rafId = requestAnimationFrame(tick);
      };

      this.rafId = requestAnimationFrame(tick);
    });
  }
}
