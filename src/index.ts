import gsap from 'gsap';

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
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
  private static readonly SKIP_DELTA_P = 0.0015;
  private static readonly EDGE_EPS_P = 0.0005;

  private static readonly ENV_POWER = 0.5;
  private static readonly RIPPLE_FREQ = 2;
  private static readonly RIPPLE_GAIN = 0.5;

  private readonly svgElRef: string | SVGElement;
  private readonly pathSelector: string;

  private readonly numberPoints: number;
  private readonly delayPaths: number;
  private readonly duration: number;
  private readonly amplitude: number;

  private svg: SVGElement | null = null;
  private paths: SVGPathElement[] = [];
  private pathCount = 0;

  private segCount = 0;
  private pStr: string[] = [];
  private cpStr: string[] = [];

  private tl: gsap.core.Timeline | null = null;
  private _isOpened: boolean;

  private readonly dBuf: string[] = [];
  private readonly ptsStr: string[] = [];

  private yWork: Float32Array[] = [];
  private lastLocalP: Float32Array = new Float32Array(0);
  private prevD: string[] = [];

  private sharedPhase = 0;

  private tArr: Float32Array = new Float32Array(0);
  private envArr: Float32Array = new Float32Array(0);
  private baseSinEnvArr: Float32Array = new Float32Array(0);
  private readonly flatTopY: Float32Array;

  constructor(opts: WavePathOptions) {
    const o = normalizeOptions(opts);

    this.svgElRef = o.svgEl;
    this.pathSelector = o.pathEl;

    this.numberPoints = o.numberPoints;
    this.delayPaths = o.delayPaths;
    this.duration = o.duration;
    this.amplitude = o.waveAmplitude;

    this._isOpened = o.isOpened;

    this.flatTopY = new Float32Array(this.numberPoints); // всегда 0

    this.precomputeX();
    this.precomputePointParams();
  }

  public get isOpened(): boolean {
    return this._isOpened;
  }

  public init(): void {
    this.svg =
      typeof this.svgElRef === 'string'
        ? document.querySelector<SVGElement>(this.svgElRef)
        : (this.svgElRef ?? null);

    if (!this.svg) {
      this.resetDomRefs();
      this.killTimeline();

      return;
    }

    this.paths = Array.from(this.svg.querySelectorAll<SVGPathElement>(this.pathSelector));
    this.pathCount = this.paths.length;

    this.killTimeline();

    if (this.pathCount === 0) {
      this.resetDomRefs();

      return;
    }

    this.allocateCaches();

    const stableD = this.buildDCubic(this.flatTopY, this._isOpened);

    for (let i = 0; i < this.pathCount; i++) this.setPathD(i, stableD);
  }

  public async open(): Promise<void> {
    if (this.isAnimating()) return;

    this._isOpened = true;

    await this.playProgress(true);
  }

  public async close(): Promise<void> {
    if (this.isAnimating()) return;

    this._isOpened = false;

    await this.playProgress(false);
  }

  public async toggle(): Promise<void> {
    if (this.isAnimating()) return;

    this._isOpened = !this._isOpened;

    await this.playProgress(this._isOpened);
  }

  public totalDurationMs(): number {
    return this.tl ? Math.round(this.tl.totalDuration() * 1000) : 0;
  }

  public stopIfActive(): void {
    if (this.tl?.isActive()) this.killTimeline();
  }

  public destroy(): void {
    this.killTimeline();
    this.resetDomRefs();
    this.resetCaches();
  }

  private isAnimating(): boolean {
    return Boolean(this.tl?.isActive());
  }

  private resetDomRefs(): void {
    this.svg = null;
    this.paths = [];
    this.pathCount = 0;
    this.prevD = [];
  }

  private resetCaches(): void {
    this.yWork = [];
    this.lastLocalP = new Float32Array(0);
  }

  private allocateCaches(): void {
    this.yWork = new Array(this.pathCount);
    this.lastLocalP = new Float32Array(this.pathCount);
    this.prevD = new Array(this.pathCount);

    for (let i = 0; i < this.pathCount; i++) {
      this.yWork[i] = new Float32Array(this.numberPoints);
      this.lastLocalP[i] = -1;
      this.prevD[i] = this.paths[i].getAttribute('d') ?? '';
    }
  }

  private setPathD(i: number, d: string): void {
    if (this.prevD[i] === d) return;

    this.paths[i].setAttribute('d', d);
    this.prevD[i] = d;
  }

  private killTimeline(): void {
    if (!this.tl) return;

    this.tl.eventCallback('onComplete', null);
    this.tl.kill();
    this.tl = null;
  }

  private precomputeX(): void {
    this.segCount = Math.max(1, this.numberPoints - 1);

    const step = PERCENT_MAX / this.segCount;

    this.pStr = new Array<string>(this.segCount);
    this.cpStr = new Array<string>(this.segCount);

    for (let j = 0; j < this.segCount; j++) {
      const pVal = (j + 1) * step;
      const cpVal = pVal - step / 2;

      this.pStr[j] = WavePath.fmt(pVal);
      this.cpStr[j] = WavePath.fmt(cpVal);
    }
  }

  private precomputePointParams(): void {
    const n = this.numberPoints;

    this.tArr = new Float32Array(n);
    this.envArr = new Float32Array(n);
    this.baseSinEnvArr = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);

      this.tArr[i] = t;

      const envRaw = 1 - Math.abs(2 * t - 1);

      this.envArr[i] = envRaw ** WavePath.ENV_POWER;
      this.baseSinEnvArr[i] = 0;
    }
  }

  private static fmt(n: number): string {
    const v = Math.round(n * 100) / 100;

    return Number.isInteger(v) ? String(v | 0) : String(v);
  }

  private static fmtY(n: number): string {
    const v = Math.round(n * 10) / 10;
    const iv = v | 0;

    return v === iv ? String(iv) : String(v);
  }

  private rollNewSharedWaveProfile(): void {
    this.sharedPhase = random01() * Math.PI * 2;

    const phase = this.sharedPhase;
    const n = this.numberPoints;
    const FREQ = WavePath.RIPPLE_FREQ;

    for (let i = 0; i < n; i++) {
      this.baseSinEnvArr[i] = Math.sin(this.tArr[i] * Math.PI * FREQ + phase) * this.envArr[i];
    }
  }

  private fillWaveYAtProgress(out: Float32Array, p: number): void {
    let pp = clamp01(p);

    if (pp < WavePath.EDGE_EPS_P) pp = 0;
    else if (pp > 1 - WavePath.EDGE_EPS_P) pp = 1;

    const lift = lerp(PERCENT_MAX, PERCENT_MIN, pp);
    const waveK = Math.sin(Math.PI * pp);

    const rippleFactor = this.amplitude * WavePath.RIPPLE_GAIN * waveK;
    const n = this.numberPoints;

    for (let i = 0; i < n; i++) {
      const y = lift + this.baseSinEnvArr[i] * rippleFactor;

      out[i] = clamp(y, PERCENT_MIN, PERCENT_MAX);
    }
  }

  private buildDCubic(y: Float32Array, opened: boolean): string {
    const { cpStr, pStr, segCount, dBuf, ptsStr } = this;

    ptsStr.length = this.numberPoints;

    for (let j = 0; j < this.numberPoints; j++) {
      ptsStr[j] = WavePath.fmtY(y[j]);
    }

    dBuf.length = 0;

    dBuf.push(
      'M',
      '0',
      ptsStr[0],
      'C',
      cpStr[0],
      ptsStr[0],
      cpStr[0],
      ptsStr[1],
      pStr[0],
      ptsStr[1],
    );

    for (let j = 1; j < segCount; j++) {
      dBuf.push('S', cpStr[j], ptsStr[j + 1], pStr[j], ptsStr[j + 1]);
    }

    dBuf.push('V', opened ? '100' : '0', 'H', '0');

    return dBuf.join(' ');
  }

  private async playProgress(opened: boolean): Promise<void> {
    if (!this.svg || this.pathCount === 0) return;

    this.killTimeline();

    this.rollNewSharedWaveProfile();

    for (let i = 0; i < this.pathCount; i++) this.lastLocalP[i] = -1;

    const total = this.duration + this.delayPaths * (this.pathCount - 1);
    const driver = { p: 0 };

    const render = (): void => {
      const tNow = clamp01(driver.p) * total;

      for (let i = 0; i < this.pathCount; i++) {
        const layerIndex = opened ? i : this.pathCount - i - 1;
        const layerDelay = this.delayPaths * layerIndex;

        const localP = clamp01((tNow - layerDelay) / this.duration);

        const prevP = this.lastLocalP[i];

        if (prevP >= 0 && Math.abs(localP - prevP) < WavePath.SKIP_DELTA_P) continue;

        this.lastLocalP[i] = localP;

        const y = this.yWork[i];

        this.fillWaveYAtProgress(y, localP);

        const d = this.buildDCubic(y, opened);

        this.setPathD(i, d);
      }
    };

    const tl = gsap.timeline({ paused: true });

    tl.to(driver, {
      p: 1,
      duration: total,
      ease: 'none',
      onUpdate: render,
      onComplete: () => {
        const stableD = this.buildDCubic(this.flatTopY, opened);
        for (let i = 0; i < this.pathCount; i++) this.setPathD(i, stableD);
      },
    });

    this.tl = tl;

    render();

    await new Promise<void>((resolve) => {
      tl.eventCallback('onComplete', () => {
        tl.eventCallback('onComplete', null);

        resolve();
      });

      tl.play(0);
    });
  }
}
