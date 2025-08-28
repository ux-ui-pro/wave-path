import gsap from 'gsap';

type EaseLike = string | ((t: number) => number);

export interface WavePathOptions {
  svgEl: string | SVGElement;
  pathEl?: string;
  numberPoints?: number;
  delayPoints?: number;
  delayPaths?: number;
  duration?: number;
  ease?: EaseLike;
  isOpened?: boolean;
}

const DEFAULTS = {
  numberPoints: 4,
  delayPoints: 0.3,
  delayPaths: 0.25,
  duration: 1,
  ease: 'none' as EaseLike,
  isOpened: false,
} as const;

const PERCENT_MIN = 0;
const PERCENT_MAX = 100;

type TimelineLike = {
  isActive(): boolean;
  totalDuration(): number;
  eventCallback(event: 'onComplete', callback: null | (() => void)): TimelineLike;
  kill(): void;
  play(position?: number): TimelineLike;
  pause(time?: number): TimelineLike;
  clear(): TimelineLike;
  progress(value?: number): TimelineLike;
  to(target: unknown, vars: Record<string, unknown>, position?: number): TimelineLike;
};

type GSAPTimelineRaw = {
  isActive?: () => boolean;
  totalDuration?: () => number;
  eventCallback?: (event: 'onComplete', callback: null | (() => void)) => unknown;
  kill?: () => void;
  play?: (position?: number) => unknown;
  pause?: (time?: number) => unknown;
  clear?: () => unknown;
  progress?: (value?: number) => unknown;
  to?: (target: unknown, vars: Record<string, unknown>, position?: number) => unknown;
};

function createTimeline(vars: {
  defaults: { ease: EaseLike; duration: number };
  onUpdate: () => void;
  paused: boolean;
}): TimelineLike {
  const rawTimelineFactory = (
    gsap as unknown as {
      timeline: (v: typeof vars) => GSAPTimelineRaw;
    }
  ).timeline;

  const raw = rawTimelineFactory(vars);

  let wrap: TimelineLike;

  wrap = {
    isActive: (): boolean => (typeof raw.isActive === 'function' ? raw.isActive() : false),

    totalDuration: (): number =>
      typeof raw.totalDuration === 'function' ? (raw.totalDuration() ?? 0) : 0,

    eventCallback: (event: 'onComplete', callback: null | (() => void)): TimelineLike => {
      if (typeof raw.eventCallback === 'function') raw.eventCallback(event, callback);

      return wrap;
    },

    kill: (): void => {
      if (typeof raw.kill === 'function') raw.kill();
    },

    play: (position?: number): TimelineLike => {
      if (typeof raw.play === 'function') raw.play(position);

      return wrap;
    },

    pause: (time?: number): TimelineLike => {
      if (typeof raw.pause === 'function') raw.pause(time);

      return wrap;
    },

    clear: (): TimelineLike => {
      if (typeof raw.clear === 'function') raw.clear();

      return wrap;
    },

    progress: (value?: number): TimelineLike => {
      if (typeof raw.progress === 'function') raw.progress(value);

      return wrap;
    },

    to: (target: unknown, vars: Record<string, unknown>, position?: number): TimelineLike => {
      if (typeof raw.to === 'function') raw.to(target, vars, position);

      return wrap;
    },
  };

  return wrap;
}

export default class WavePath {
  private readonly options: Readonly<WavePathOptions>;
  private readonly numberPoints: number;
  private readonly delayPoints: number;
  private readonly delayPaths: number;
  private readonly duration: number;
  private readonly ease: EaseLike;

  private svg: SVGElement | null = null;
  private paths: SVGPathElement[] = [];
  private pathCount = 0;
  private segCount = 0;

  private p!: Float32Array;
  private cp!: Float32Array;
  private pStr!: string[];
  private cpStr!: string[];
  private ptsStr: string[] = [];

  private tl?: TimelineLike;
  private _isOpened: boolean;

  private pointsDelay: number[] = [];
  private allPoints: number[][] = [];
  private dBuf: string[] = [];
  private prevD: string[] = [];

  constructor(opts: WavePathOptions) {
    const merged = {
      ...DEFAULTS,
      ...opts,
      numberPoints: Math.max(2, opts.numberPoints ?? DEFAULTS.numberPoints),
    } as const;

    this.options = merged;
    this.numberPoints = merged.numberPoints;
    this.delayPoints = merged.delayPoints;
    this.delayPaths = merged.delayPaths;
    this.duration = merged.duration;
    this.ease = merged.ease;
    this._isOpened = merged.isOpened;

    this.precomputeX();
  }

  public get isOpened(): boolean {
    return this._isOpened;
  }

  public init(): void {
    const { svgEl, pathEl = 'path' } = this.options;

    this.svg =
      typeof svgEl === 'string' ? document.querySelector<SVGElement>(svgEl) : (svgEl ?? null);

    if (!this.svg) {
      this.paths = [];
      this.pathCount = 0;
      this.prevD = [];

      return;
    }

    this.paths = Array.from(this.svg.querySelectorAll<SVGPathElement>(pathEl));
    this.pathCount = this.paths.length;
    this.prevD = this.paths.map((p) => p.getAttribute('d') ?? '');

    this.initializePointsStorage();

    this.tl = createTimeline({
      defaults: { ease: this.ease, duration: this.duration },
      onUpdate: () => this.render(),
      paused: true,
    });

    if (this.pathCount > 0) {
      this.updateTimeline();
      this.tl.progress(1);
    }
  }

  public async open(): Promise<void> {
    if (!this.tl || this.tl.isActive()) return;

    this._isOpened = true;
    this.updateTimeline();

    await this.playFromStart();
  }

  public async close(): Promise<void> {
    if (!this.tl || this.tl.isActive()) return;

    this._isOpened = false;
    this.updateTimeline();

    await this.playFromStart();
  }

  public async toggle(): Promise<void> {
    if (!this.tl || this.tl.isActive()) return;

    this._isOpened = !this._isOpened;
    this.updateTimeline();

    await this.playFromStart();
  }

  public totalDurationMs(): number {
    return this.tl ? Math.round(this.tl.totalDuration() * 1000) : 0;
  }

  public stopIfActive(): void {
    if (this.tl?.isActive()) this.tl.kill();
  }

  public destroy(): void {
    if (this.tl) {
      this.tl.eventCallback('onComplete', null);
      this.tl.kill();
    }

    for (const pts of this.allPoints) gsap.killTweensOf(pts);

    this.svg = null;
    this.paths = [];
    this.pathCount = 0;

    this.pointsDelay = [];
    this.allPoints = [];
    this.dBuf = [];
    this.prevD = [];

    this.tl = undefined;
  }

  private precomputeX(): void {
    this.segCount = Math.max(1, this.numberPoints - 1);

    const step = PERCENT_MAX / this.segCount;

    this.p = new Float32Array(this.segCount);
    this.cp = new Float32Array(this.segCount);
    this.pStr = new Array<string>(this.segCount);
    this.cpStr = new Array<string>(this.segCount);

    for (let j = 0; j < this.segCount; j++) {
      const pVal = (j + 1) * step;
      const cpVal = pVal - step / 2;

      this.p[j] = pVal;
      this.cp[j] = cpVal;

      this.pStr[j] = WavePath.fmt(pVal);
      this.cpStr[j] = WavePath.fmt(cpVal);
    }
  }

  private initializePointsStorage(): void {
    const n = this.numberPoints;

    this.allPoints = Array.from({ length: this.pathCount }, () =>
      new Array<number>(n).fill(PERCENT_MAX),
    );

    this.pointsDelay = new Array<number>(n).fill(0);
  }

  private static fmt(n: number): string {
    const v = Math.round(n * 10) / 10;

    return Number.isInteger(v) ? String(v | 0) : String(v);
  }

  private render(): void {
    if (this.pathCount === 0) return;

    const { paths, allPoints, segCount, cpStr, pStr, ptsStr } = this;
    const opened = this._isOpened;
    const buf = this.dBuf;

    for (let i = 0; i < paths.length; i++) {
      const pathEl = paths[i];
      const pts = allPoints[i];

      ptsStr.length = this.numberPoints;

      for (let j = 0; j < this.numberPoints; j++) {
        const v = Math.round(pts[j] * 10) / 10;

        ptsStr[j] = Number.isInteger(v) ? String(v | 0) : String(v);
      }

      buf.length = 0;

      buf.push(
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
        buf.push('S', cpStr[j], ptsStr[j + 1], pStr[j], ptsStr[j + 1]);
      }

      if (opened) {
        buf.push('V', String(PERCENT_MAX), 'H', '0');
      } else {
        buf.push('V', String(PERCENT_MIN), 'H', '0');
      }

      const d = buf.join(' ');

      if (this.prevD[i] !== d) {
        pathEl.setAttribute('d', d);

        this.prevD[i] = d;
      }
    }
  }

  private updateTimeline(): void {
    if (!this.tl) return;

    const tl = this.tl;

    tl.pause(0).clear();

    this.prepareDelays();
    this.enqueueTweens(tl);
  }

  private prepareDelays(): void {
    for (let j = 0; j < this.numberPoints; j++) {
      this.pointsDelay[j] = Math.random() * this.delayPoints;
    }
  }

  private enqueueTweens(tl: TimelineLike): void {
    const opened = this._isOpened;
    const delayPaths = this.delayPaths;
    const pathCount = this.pathCount;

    for (let i = 0; i < pathCount; i++) {
      const pts = this.allPoints[i];
      const pathDelay = delayPaths * (opened ? i : pathCount - i - 1);

      for (let j = 0; j < this.numberPoints; j++) {
        tl.to(pts, { [j]: PERCENT_MIN }, this.pointsDelay[j] + pathDelay);
      }
    }
  }

  private async playFromStart(): Promise<void> {
    if (!this.tl) return;

    await new Promise<void>((resolve) => {
      const onComplete = (): void => {
        this.tl!.eventCallback('onComplete', null);

        resolve();
      };

      this.tl!.eventCallback('onComplete', onComplete);
      this.tl!.play(0);
    });
  }
}
