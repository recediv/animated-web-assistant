export type MotionKind = 'stroll' | 'climb' | 'peek' | 'wiggle' | 'flip';
export type ArrivalKind = 'left' | 'right' | 'bottom' | 'top';
export type MotionPhase =
  | MotionKind
  | 'arrival'
  | 'drag'
  | 'fall'
  | 'parachute'
  | 'land'
  | 'return'
  | 'hide'
  | 'page-push'
  | null;
export interface MotionMetadata {
  facing?: -1 | 1;
  arrival?: ArrivalKind;
  activity?: 'walk' | 'hide' | 'look' | 'head-look' | 'climb' | 'grip' | 'curl' | 'roll' | 'uncurl';
  durationMs?: number;
  progress?: number;
}
export interface MotionOptions {
  headOnly?: boolean;
}
export interface ReleaseOptions {
  parachute?: boolean;
  reducedMotion?: boolean;
}
export interface RecoveryOptions {
  reducedMotion?: boolean;
}
export interface GeometryOptions {
  /** Follow viewport changes without switching supports. */
  followGround?: boolean;
}
export interface PersonalityPlacement {
  launcherLeft: number;
  launcherTop: number;
}
export interface PersonalityViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface PersonalityOffset {
  x: number;
  y: number;
}

type Point = PersonalityOffset;
interface Stage {
  phase: Exclude<MotionPhase, null | 'drag'>;
  duration: number;
  from: Point;
  to: Point;
  peak?: Point;
  curve?: 'gravity' | 'linear';
  bounds?: 'peek' | 'free';
  groundTo?: boolean;
  preserveOutside?: boolean;
  arrival?: ArrivalKind;
  activity?: MotionMetadata['activity'];
  edge?: 'left' | 'right';
  edgeTarget?: 'outside' | 'peek' | 'edge';
  speed?: number;
  facing?: -1 | 1;
  hold?: boolean;
  sample?: { from: number; to: number };
}
interface Route {
  stages: Stage[];
  startedAt: number;
  phaseIndex: number;
  promise: Promise<void>;
  resolve(): void;
}
const DURATIONS: Record<MotionKind, number> = {
  stroll: 2400,
  climb: 2800,
  peek: 1600,
  wiggle: 3200,
  flip: 2500,
};
// The rotated head starts at column 71 in a 192px cell; mirroring swaps edges.
const HEAD_PEEK_INK_INSET = 71 / 192;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);
const ease = (progress: number) => (1 - Math.cos(Math.PI * clamp(progress, 0, 1))) / 2;
const between = (from: Point, to: Point, progress: number): Point => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress,
});

/** One finite path at a time. Manual dragging owns no frame loop. */
export class PersonalityMotion {
  private placement: PersonalityPlacement | null = null;
  private viewport: PersonalityViewport | null = null;
  private size = 96;
  private side: 'left' | 'right' = 'right';
  private current: Point = { x: 0, y: 0 };
  private route: Route | null = null;
  private frame: number | null = null;
  private geometryFrame: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextDirection: -1 | 1 = -1;
  private facing: -1 | 1 = 1;
  private outside = false;
  private isDragging = false;
  private restingX: number | null = null;
  private destroyed = false;
  private originalTransform: string;
  private originalWillChange: string;

  constructor(
    private launcher: HTMLButtonElement,
    private onMoving: (phase: MotionPhase, metadata?: MotionMetadata) => void,
    private onPosition: (offset: Readonly<PersonalityOffset>, metadata?: MotionMetadata) => void = () => {},
    private random: () => number = Math.random,
  ) {
    this.originalTransform = launcher.style.transform;
    this.originalWillChange = launcher.style.willChange;
  }

  get moving(): boolean {
    return this.route !== null || this.isDragging;
  }
  get dragging(): boolean {
    return this.isDragging;
  }
  get offset(): Readonly<Point> {
    return { ...this.current };
  }
  get airborne(): boolean {
    return this.valid() && Math.abs(this.current.y - this.ground()) > .5;
  }
  get needsRecovery(): boolean {
    return (
      this.valid() &&
      !this.isDragging &&
      (this.airborne ||
        this.horizontalRecoveryRequired(this.current))
    );
  }

  get canPagePush(): boolean {
    if (!this.valid() || this.isDragging || Math.abs(this.current.y - this.ground()) > .5) return false;
    const left = this.placement!.launcherLeft + this.current.x;
    return left >= this.viewport!.left - .5 && left + this.size <= this.viewport!.left + this.viewport!.width + .5;
  }

  needsPageRoll(side: 'left' | 'right', viewport = this.viewport!): boolean {
    if (!this.valid()) return false;
    const supported = this.recoveryStages(this.current).at(-1)?.to ?? this.current;
    const left = this.placement!.launcherLeft + supported.x;
    const gap = side === 'left' ? left - viewport.left : viewport.left + viewport.width - left - this.size;
    return gap > this.size * 2;
  }

  /** Settle when the approach ends or is cancelled. */
  approachPagePush(side: 'left' | 'right', options: { settleToGround?: boolean; pageViewport?: PersonalityViewport } = {}): Promise<void> {
    if (!this.canPagePush) {
      if (!options.settleToGround || !this.valid() || this.isDragging) return Promise.resolve();
    }
    this.cancel();
    const from = { ...this.current };
    // Keep descent, landing and approach in one cancellable route.
    const recovery = options.settleToGround ? this.recoveryStages(from) : [];
    const rollingFrom = { ...(recovery.at(-1)?.to ?? from) };
    const to = this.pagePushPoint(side, 0, options.pageViewport);
    const viewport = options.pageViewport ?? this.viewport!;
    if (!this.needsPageRoll(side, viewport)) {
      return this.start([...recovery, { phase: 'page-push', from: rollingFrom, to, groundTo: true,
        bounds: 'free', curve: 'linear', duration: clamp(Math.abs(to.x - rollingFrom.x) / 700 * 1000, 170, 850), activity: 'walk' }]);
    }
    // Roll all the way to the original offscreen paw-contact point, then
    // unfold in place so the page push starts without another translation.
    const distance = Math.abs(to.x - rollingFrom.x);
    const turns = Math.max(1, Math.round(distance / (this.size * Math.PI * 110 / 192)));
    const direction = to.x < rollingFrom.x ? -1 : 1;
    return this.start([...recovery,
      { phase: 'page-push', from: rollingFrom, to: rollingFrom, duration: 320, activity: 'curl', hold: true,
        bounds: 'free', facing: 1, sample: { from: 0, to: 1 } },
      { phase: 'page-push', from: rollingFrom, to, groundTo: true, bounds: 'free',
        duration: clamp(distance / (this.size * 10) * 1000, 180, 1100), activity: 'roll', facing: 1,
        sample: { from: 0, to: direction * turns } },
      { phase: 'page-push', from: to, to, groundTo: true, bounds: 'free', duration: 320,
        activity: 'uncurl', hold: true, facing: 1, sample: { from: 0, to: 1 } },
    ]);
  }

  /** Follow progress from the page's animation loop. */
  pagePushProgress(side: 'left' | 'right', progress: number, pageViewport?: PersonalityViewport): void {
    if (!this.valid() || this.moving || !Number.isFinite(progress)) return;
    this.apply(this.pagePushPoint(side, clamp(progress, 0, 1), pageViewport));
    this.restingX = this.current.x;
  }

  /** Release at the nearest visible resting point. */
  finishPagePush(): void {
    if (!this.valid()) return;
    this.cancel();
    const bounds = this.bounds();
    // Preserve height; runtime recovery handles the current support.
    this.apply({ x: clamp(this.current.x, bounds.left, bounds.right), y: this.current.y });
    this.restingX = this.current.x;
  }

  private pagePushPoint(side: 'left' | 'right', progress: number, viewport = this.viewport!): Point {
    const placement = this.placement!;
    const boundary = viewport.left + (side === 'left' ? progress : 1 - progress) * viewport.width;
    // Align paw tips with the page edge.
    const contact = (side === 'left' ? 170 : 22) / 192 * this.size;
    return { x: boundary - contact - placement.launcherLeft, y: this.ground() };
  }

  updateBase(
    placement: PersonalityPlacement,
    viewport: PersonalityViewport,
    size: number,
    side: 'left' | 'right',
    options: GeometryOptions = {},
  ): void {
    if (
      this.destroyed ||
      ![
        placement.launcherLeft,
        placement.launcherTop,
        viewport.left,
        viewport.top,
        viewport.width,
        viewport.height,
        size,
      ].every(Number.isFinite) ||
      viewport.width <= 0 ||
      viewport.height <= 0 ||
      size <= 0
    )
      return;
    const old = this.placement;
    const oldViewport = this.viewport;
    const oldSize = this.size;
    const oldGround = old && oldViewport
      ? oldViewport.top + oldViewport.height - (oldSize * 11) / 12 - old.launcherTop
      : null;
    const floorDelta = oldViewport
      ? viewport.top + viewport.height - (size * 11) / 12 -
        (oldViewport.top + oldViewport.height - (oldSize * 11) / 12)
      : 0;
    const activeStage = this.route?.stages[this.route.phaseIndex];
    const followsGround = !!options.followGround && !this.isDragging &&
      oldGround !== null && Math.abs(this.current.y - oldGround) <= .5 &&
      (!activeStage || ['stroll', 'wiggle', 'peek', 'return', 'hide'].includes(activeStage.phase) ||
        (activeStage.phase === 'arrival' && activeStage.activity === 'walk'));
    const geometryChanged =
      !!oldViewport &&
      (oldViewport.left !== viewport.left ||
        oldViewport.top !== viewport.top ||
        oldViewport.width !== viewport.width ||
        oldViewport.height !== viewport.height ||
        oldSize !== size);
    const floorChanged = !!oldViewport && Math.abs(floorDelta) > 0.5;
    const keepPosition = !!old;
    const shift =
      old && keepPosition
        ? {
            x: old.launcherLeft - placement.launcherLeft,
            y: old.launcherTop - placement.launcherTop + (followsGround ? floorDelta : 0),
          }
        : { x: 0, y: 0 };
    if (!old || this.side !== side) this.nextDirection = side === 'right' ? -1 : 1;
    this.placement = { ...placement };
    this.viewport = { ...viewport };
    this.size = size;
    this.side = side;
    if (!old) this.current = this.home();
    if (shift.x || shift.y || geometryChanged) {
      this.current = { x: this.current.x + shift.x, y: this.current.y + shift.y };
      if (this.restingX !== null) this.restingX += shift.x;
      if (this.route)
        for (const stage of this.route.stages) {
          stage.from = { x: stage.from.x + shift.x, y: stage.from.y + shift.y };
          stage.to = { x: stage.to.x + shift.x, y: stage.to.y + shift.y };
          if (stage.peak) stage.peak = { x: stage.peak.x + shift.x, y: stage.peak.y + shift.y };
          if (stage.groundTo) stage.to.y = this.ground();
          if (stage.edge && stage.edgeTarget)
            stage.to.x = this.edgePoint(
              stage.edge,
              stage.edgeTarget,
              stage.activity === 'head-look' ? this.headPeekVisiblePx() : 48,
            ).x;
          if (stage.speed) stage.speed = this.walkSpeed();
        }
      if (this.route)
        for (let index = 1; index < this.route.stages.length; index++) {
          const stage = this.route.stages[index]!;
          stage.from = { ...this.route.stages[index - 1]!.to };
          if (stage.phase === 'land' || stage.hold) stage.to = { ...stage.from };
          if (stage.speed)
            stage.duration = Math.max(
              1,
              (Math.abs(stage.to.x - stage.from.x) / stage.speed) * 1000,
            );
        }
      if (this.route) {
        const route = this.route;
        let elapsed = Math.max(0, performance.now() - route.startedAt);
        for (let index = 0; index < route.phaseIndex; index++)
          elapsed -= route.stages[index]!.duration;
        const stages = route.stages.slice(route.phaseIndex);
        const active = stages[0]!;
        if (active.sample) {
          const progress = clamp(elapsed / active.duration, 0, 1);
          const weight = active.curve === 'linear' ? progress : ease(progress);
          active.sample.from += (active.sample.to - active.sample.from) * weight;
        }
        const remaining = Math.max(1, active.duration - elapsed);
        this.current =
          active.bounds === 'free'
            ? this.current
            : this.horizontalBounded(this.current, active.bounds === 'peek');
        if (active.hold && active.activity === 'head-look' && active.edge)
          this.current.x = this.edgePoint(active.edge, 'peek', this.headPeekVisiblePx()).x;
        active.from = { ...this.current };
        // A changed floor continues from the pixel already drawn instead of replaying a curve.
        active.peak = undefined;
        active.duration = active.speed
          ? Math.max(1, (Math.abs(active.to.x - active.from.x) / active.speed) * 1000)
          : remaining;
        const recovery =
          floorChanged && !followsGround && ['stroll', 'wiggle', 'peek', 'return', 'hide'].includes(active.phase)
            ? this.recoveryStages(this.current).filter(
                (stage) => !active.activity || stage.phase !== 'return',
              )
            : [];
        if (recovery.length) active.from = { ...recovery.at(-1)!.to };
        if (active.hold) active.to = { ...active.from };
        route.stages = [...recovery, ...stages];
        route.phaseIndex = 0;
        route.startedAt = performance.now();
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        if (this.timer !== null) clearTimeout(this.timer);
        this.frame = null;
        this.timer = null;
        const next = route.stages[0]!;
        if (recovery.length || active.speed) this.stageChanged(next);
        if (this.route === route) this.schedule(route, next, 0);
      }
    }
    if (this.isDragging) {
      this.clearGeometryFrame();
      this.apply(this.dragBounded(this.current));
    } else if (this.route) {
      const stage = this.route.stages[this.route.phaseIndex]!;
      this.apply(
        stage.bounds === 'free'
          ? this.current
          : this.horizontalBounded(this.current, stage.bounds === 'peek'),
      );
    } else if (shift.x || shift.y || followsGround) {
      this.clearGeometryFrame();
      this.apply(
        this.horizontalRecoveryRequired(this.current)
          ? this.current
          : this.horizontalBounded(this.current, this.outside),
      );
    } else if (this.geometryFrame === null) {
      this.geometryFrame = requestAnimationFrame(() => {
        this.geometryFrame = null;
        if (!this.destroyed)
          this.apply(
            this.horizontalRecoveryRequired(this.current)
              ? this.current
              : this.horizontalBounded(this.current, this.outside),
          );
      });
    }
  }

  place(offset: PersonalityOffset): void {
    if (!this.valid() || ![offset.x, offset.y].every(Number.isFinite)) return;
    this.cancel();
    this.apply(this.bounded(offset));
  }
  spawn(): void {
    if (!this.valid()) return;
    const bounds = this.bounds();
    this.place({ x: bounds.left + (bounds.right - bounds.left) * this.sample(), y: this.ground() });
  }

  /** Recover after a paused scroll/viewport change. Document scroll offsets are never used. */
  recover(options: RecoveryOptions = {}): Promise<void> {
    if (this.route) return this.route.promise;
    if (this.isDragging || !this.valid()) return Promise.resolve();
    const from = { ...this.current };
    if (options.reducedMotion) {
      const unsupported = this.needsRecovery;
      this.clearGeometryFrame();
      const bounds = this.bounds();
      this.apply({
        x: this.horizontalRecoveryRequired(from)
          ? clamp(from.x, bounds.left, bounds.right)
          : from.x,
        y: this.ground(),
      });
      if (unsupported) this.notify(null);
      return Promise.resolve();
    }
    const stages = this.recoveryStages(from);
    return stages.length ? this.start(stages) : Promise.resolve();
  }

  run(kind: MotionKind, options: MotionOptions = {}): Promise<void> {
    if (this.route) return this.route.promise;
    if (this.isDragging || !this.valid() || !(kind in DURATIONS)) return Promise.resolve();
    const current = { ...this.current };
    const recovery = this.recoveryStages(current);
    const from = {
      ...(recovery.at(-1)?.to ?? this.horizontalBounded(current, this.outside)),
      y: this.ground(),
    };
    const bounds = this.bounds();
    let to = { ...from };
    let peak: Point | undefined;
    const peek = this.outside;
    let duration = DURATIONS[kind];
    if (kind === 'stroll') {
      const distance = this.size * 1.32 * (0.8 + this.sample() * 0.2);
      let direction = this.nextDirection;
      let x = clamp(from.x + distance * direction, bounds.left, bounds.right);
      if (Math.abs(x - from.x) < 1) {
        direction = direction === -1 ? 1 : -1;
        x = clamp(from.x + distance * direction, bounds.left, bounds.right);
      }
      this.nextDirection = direction === -1 ? 1 : -1;
      to = { x, y: this.ground() };
      duration = Math.max(1, Math.round((Math.abs(x - from.x) / this.walkSpeed()) * 1000));
    } else if (kind === 'climb') {
      return this.start([...recovery, ...this.climbStages(from)]);
    } else if (kind === 'peek') {
      return this.start([...recovery, ...this.peekStages(from, options.headOnly === true)]);
    } else if (kind === 'flip') {
      peak = { x: from.x, y: Math.max(bounds.top, from.y - Math.min(90, this.size)) };
    }
    return this.start([
      ...recovery,
      {
        phase: kind,
        duration,
        from,
        to,
        peak,
        curve: kind === 'stroll' ? 'linear' : undefined,
        speed: kind === 'stroll' ? this.walkSpeed() : undefined,
        bounds: peek ? 'peek' : undefined,
        groundTo: true,
        preserveOutside: this.outside && (kind === 'wiggle' || kind === 'flip'),
      },
    ]);
  }

  private walkSpeed(): number {
    return this.size * 0.55;
  }
  private climbStages(from: Point): Stage[] {
    const bounds = this.bounds();
    const edge =
      Math.abs(from.x - bounds.left) < Math.abs(bounds.right - from.x) ? 'left' : 'right';
    const floor = this.edgePoint(edge, 'edge');
    const height = Math.min(
      160,
      this.size * (0.9 + this.sample() * 0.45),
      Math.max(0, floor.y - bounds.top),
    );
    const first = { x: floor.x, y: floor.y - height * 0.4 };
    const top = { x: floor.x, y: floor.y - height };
    const stages: Stage[] = [];
    if (Math.abs(floor.x - from.x) > 0.5)
      stages.push({
        phase: 'stroll',
        activity: 'walk',
        from,
        to: floor,
        duration: (Math.abs(floor.x - from.x) / this.walkSpeed()) * 1000,
        curve: 'linear',
        groundTo: true,
        edge,
        edgeTarget: 'edge',
        speed: this.walkSpeed(),
      });
    const pull = (start: Point, end: Point, duration: number): Stage => ({
      phase: 'climb',
      activity: 'climb',
      from: start,
      to: end,
      duration,
      bounds: 'free',
      edge,
      edgeTarget: 'edge',
    });
    const grip = (point: Point, duration: number): Stage => ({
      phase: 'climb',
      activity: 'grip',
      from: point,
      to: point,
      duration,
      hold: true,
      bounds: 'free',
    });
    stages.push(pull(floor, first, 750), grip(first, 150), pull(first, top, 750), grip(top, 200), {
      ...pull(top, floor, 950),
      groundTo: true,
    });
    return stages;
  }
  private edgePoint(
    edge: 'left' | 'right',
    target: NonNullable<Stage['edgeTarget']>,
    visiblePx = 48,
  ): Point {
    const bounds = this.bounds();
    const viewport = this.viewport!;
    const placement = this.placement!;
    const visible = Math.min(visiblePx, this.size, viewport.width);
    const x =
      target === 'outside'
        ? edge === 'right'
          ? viewport.left + viewport.width + 8 - placement.launcherLeft
          : viewport.left - this.size - 8 - placement.launcherLeft
        : target === 'peek'
          ? edge === 'right'
            ? viewport.left + viewport.width - visible - placement.launcherLeft
            : viewport.left - this.size + visible - placement.launcherLeft
          : edge === 'right'
            ? bounds.right
            : bounds.left;
    return { x, y: this.ground() };
  }
  private headPeekVisiblePx(): number {
    return this.size * (1 - HEAD_PEEK_INK_INSET);
  }
  private peekStages(from: Point, headOnly: boolean): Stage[] {
    const bounds = this.bounds();
    const edge =
      Math.abs(from.x - bounds.left) < Math.abs(bounds.right - from.x) ? 'left' : 'right';
    const speed = this.walkSpeed();
    const outside = this.edgePoint(edge, 'outside');
    const peek = this.edgePoint(edge, 'peek', headOnly ? this.headPeekVisiblePx() : 48);
    const ending = this.edgePoint(edge, 'edge');
    const walk = (
      start: Point,
      end: Point,
      phase: 'peek' | 'return',
      edgeTarget: NonNullable<Stage['edgeTarget']>,
    ): Stage => ({
      phase,
      from: start,
      to: end,
      duration: Math.max(1, (Math.abs(end.x - start.x) / speed) * 1000),
      curve: 'linear',
      bounds: 'free',
      groundTo: true,
      activity: 'walk',
      edge,
      edgeTarget,
      speed,
    });
    const hold = (
      point: Point,
      phase: 'peek' | 'hide',
      activity: 'hide' | 'look' | 'head-look',
      duration: number,
    ): Stage => ({
      phase,
      from: point,
      to: point,
      duration,
      bounds: 'free',
      groundTo: true,
      activity,
      hold: true,
    });
    const stages = [
      walk(from, outside, 'peek', 'outside'),
      hold(outside, 'hide', 'hide', 600 + this.sample() * 400),
    ];
    if (headOnly) {
      const facing = edge === 'left' ? 1 : -1;
      const head = (start: Point, end: Point, edgeTarget: 'outside' | 'peek'): Stage => ({
        phase: 'peek',
        from: start,
        to: end,
        duration: 500,
        curve: 'linear',
        bounds: 'free',
        groundTo: true,
        activity: 'head-look',
        facing,
        edge,
        edgeTarget,
      });
      stages.push(
        head(outside, peek, 'peek'),
        { ...hold(peek, 'peek', 'head-look', 1000), facing, edge, edgeTarget: 'peek' },
        head(peek, outside, 'outside'),
        hold(outside, 'hide', 'hide', 300),
        walk(outside, ending, 'return', 'edge'),
      );
      return stages;
    }
    stages.push(walk(outside, peek, 'peek', 'peek'), hold(peek, 'peek', 'look', 1000));
    if (this.sample() < 0.5)
      stages.push(
        walk(peek, outside, 'peek', 'outside'),
        hold(outside, 'hide', 'hide', 400 + this.sample() * 300),
        walk(outside, ending, 'return', 'edge'),
      );
    else stages.push(walk(peek, ending, 'return', 'edge'));
    return stages;
  }

  beginDrag(): boolean {
    if (!this.valid()) return false;
    if (this.isDragging) return true;
    this.cancel();
    this.isDragging = true;
    this.launcher.style.willChange = 'transform';
    this.apply(this.current);
    this.notify('drag');
    return this.isDragging;
  }
  dragTo(offset: PersonalityOffset): void {
    if (!this.isDragging || ![offset.x, offset.y].every(Number.isFinite)) return;
    this.apply(this.dragBounded(offset));
  }
  release(options: ReleaseOptions = {}): Promise<void> {
    // A press may interrupt a fall without ever crossing the drag threshold.
    if (!this.isDragging && (this.route || !this.needsRecovery)) return this.route?.promise ?? Promise.resolve();
    this.isDragging = false;
    const landing = this.bounded({ x: this.current.x, y: this.ground() });
    this.restingX = landing.x;
    if (options.reducedMotion || !this.valid()) {
      this.launcher.style.willChange = this.originalWillChange;
      this.apply(landing);
      this.notify(null);
      return Promise.resolve();
    }
    const stages = this.fallStages(
      this.horizontalBounded(this.current),
      options.parachute === true,
    );
    return this.start(stages);
  }

  enter(kind?: ArrivalKind): Promise<void> {
    if (!this.valid()) return Promise.resolve();
    this.cancel();
    const arrivals: ArrivalKind[] = ['left', 'right', 'bottom', 'top'];
    const arrival = kind ?? arrivals[Math.min(3, Math.floor(this.sample() * 4))]!;
    if (!arrivals.includes(arrival)) return Promise.resolve();
    const bounds = this.bounds();
    const target = {
      x: bounds.left + (bounds.right - bounds.left) * (0.15 + this.sample() * 0.7),
      y: this.ground(),
    };
    const from = { ...target };
    let stages: Stage[];
    if (arrival === 'left' || arrival === 'right') {
      const inset = 40 + this.sample() * (this.size <= 64 ? 56 : 80);
      target.x = clamp(
        arrival === 'left' ? bounds.left + inset : bounds.right - inset,
        bounds.left,
        bounds.right,
      );
      Object.assign(from, this.edgePoint(arrival, 'outside'));
      const duration = Math.max(1, (Math.abs(target.x - from.x) / this.walkSpeed()) * 1000);
      stages = [
        {
          phase: 'arrival',
          duration,
          from,
          to: target,
          curve: 'linear',
          bounds: 'free',
          groundTo: true,
          arrival,
          activity: 'walk',
          speed: this.walkSpeed(),
        },
      ];
    } else if (arrival === 'bottom') {
      from.y = bounds.bottom + this.size + 8;
      stages = [
        {
          phase: 'climb',
          duration: 2000 + this.sample() * 700,
          from,
          to: target,
          bounds: 'free',
          groundTo: true,
          arrival,
        },
      ];
    } else {
      from.y = bounds.top - this.size - 8;
      stages = this.fallStages(from, true, true);
      for (const stage of stages) stage.arrival = arrival;
    }
    this.apply(from);
    return this.start(stages);
  }

  cancel(reset = false): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.frame = null;
    this.clearGeometryFrame();
    const route = this.route;
    const engaged = !!route || this.isDragging;
    this.route = null;
    this.isDragging = false;
    this.launcher.style.willChange = this.originalWillChange;
    if (reset) {
      this.nextDirection = this.side === 'right' ? -1 : 1;
      this.apply(this.home());
    }
    if (engaged) this.notify(null);
    route?.resolve();
  }
  reset(): void {
    this.cancel(true);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancel(true);
    this.launcher.style.transform = this.originalTransform;
    this.placement = null;
    this.viewport = null;
    this.onMoving = () => {};
    this.onPosition = () => {};
  }

  private fallStages(from: Point, parachute: boolean, entering = false): Stage[] {
    const target = { x: from.x, y: this.ground() };
    const height = Math.max(0, target.y - from.y);
    const stages: Stage[] = [];
    if (parachute && height > this.size * 4) {
      // Choose the parachute pose immediately; a free-fall intro would briefly
      // show its frightened face before switching to the calm canopy pose.
      stages.push({
        phase: 'parachute',
        duration: clamp((height / 180) * 1000, 650, 2200),
        from,
        to: target,
        curve: 'linear',
        groundTo: true,
        bounds: entering ? 'free' : undefined,
      });
    } else
      stages.push({
        phase: 'fall',
        duration: clamp(Math.sqrt((2 * height) / 1800) * 1000, 180, 1100),
        from,
        to: target,
        curve: 'gravity',
        groundTo: true,
        bounds: entering ? 'free' : undefined,
      });
    stages.push({ phase: 'land', duration: 500, from: target, to: target, groundTo: true });
    return stages;
  }

  private recoveryStages(from: Point): Stage[] {
    const target = { x: from.x, y: this.ground() };
    const distance = target.y - from.y;
    const common = { bounds: 'free' as const, groundTo: true, preserveOutside: this.outside };
    const stages: Stage[] = [];
    if (distance < -0.5)
      stages.push({
        phase: 'climb',
        duration: clamp(-distance * 2, 180, 700),
        from,
        to: target,
        ...common,
      });
    else if (distance > 0.5)
      stages.push(
        {
          phase: 'fall',
          duration: clamp(Math.sqrt((2 * distance) / 1800) * 1000, 120, 400),
          from,
          to: target,
          curve: 'gravity',
          ...common,
        },
        { phase: 'land', duration: 500, from: target, to: target, ...common },
      );
    if (this.horizontalRecoveryRequired(from)) {
      const bounds = this.bounds();
      const visible = { x: clamp(from.x, bounds.left, bounds.right), y: target.y };
      stages.push({
        phase: 'return',
        duration: clamp(Math.abs(visible.x - from.x) * 2, 180, 600),
        from: stages.length ? target : from,
        to: visible,
        bounds: 'free',
        groundTo: true,
      });
    }
    return stages;
  }

  private start(stages: Stage[]): Promise<void> {
    this.clearGeometryFrame();
    let resolve: () => void = () => {};
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const route: Route = { stages, startedAt: performance.now(), phaseIndex: 0, promise, resolve };
    this.route = route;
    this.launcher.style.willChange = 'transform';
    this.stageChanged(stages[0]!);
    if (this.route === route) this.schedule(route, stages[0]!, 0);
    return promise;
  }
  private tick = (at: number): void => {
    this.frame = null;
    const route = this.route;
    if (!route || this.destroyed) return;
    let elapsed = Math.max(0, at - route.startedAt);
    let index = 0;
    while (index < route.stages.length - 1 && elapsed >= route.stages[index]!.duration) {
      elapsed -= route.stages[index]!.duration;
      index++;
    }
    if (index !== route.phaseIndex)
      for (let next = route.phaseIndex + 1; next <= index; next++) {
        const previous = route.stages[next - 1]!;
        const stage = route.stages[next]!;
        route.phaseIndex = next;
        if (previous.phase !== stage.phase || previous.activity !== stage.activity)
          this.stageChanged(stage);
        if (this.route !== route) return;
      }
    const stage = route.stages[index]!;
    const progress = clamp(elapsed / stage.duration, 0, 1);
    let point: Point;
    if (stage.peak) {
      const local = stage.phase === 'flip' ? clamp((progress - 0.2) / 0.6, 0, 1) : progress;
      point =
        local <= 0.5
          ? between(stage.from, stage.peak, ease(local * 2))
          : between(stage.peak, stage.to, ease((local - 0.5) * 2));
    } else
      point = between(
        stage.from,
        stage.to,
        stage.curve === 'gravity'
          ? progress * progress
          : stage.curve === 'linear'
            ? progress
            : ease(progress),
      );
    const atEnd = index === route.stages.length - 1 && progress >= 1;
    if (
      !atEnd &&
      !stage.facing &&
      ['arrival', 'stroll', 'peek', 'return', 'hide'].includes(stage.phase)
    ) {
      const dx = stage.peak
        ? progress <= 0.5
          ? stage.peak.x - stage.from.x
          : stage.to.x - stage.peak.x
        : stage.to.x - stage.from.x;
      const facing = dx < 0 ? -1 : 1;
      if (Math.abs(dx) > 0.5 && facing !== this.facing) {
        this.facing = facing;
        this.notify(stage.phase, { facing });
        if (this.route !== route) return;
      }
    }
    this.apply(
      stage.bounds === 'free' && (!atEnd || stage.phase === 'page-push')
        ? point
        : this.bounded(
            point,
            stage.preserveOutside === true || (stage.bounds === 'peek' && !atEnd),
          ),
      progress,
    );
    if (atEnd) {
      this.route = null;
      this.launcher.style.willChange = this.originalWillChange;
      this.notify(null);
      route.resolve();
    } else if (this.route === route) this.schedule(route, stage, elapsed);
  };
  private schedule(route: Route, stage: Stage, elapsed: number): void {
    if (!stage.sample && !stage.peak && stage.from.x === stage.to.x && stage.from.y === stage.to.y) {
      this.timer = setTimeout(
        () => {
          this.timer = null;
          if (this.route === route) this.tick(performance.now());
        },
        Math.max(1, stage.duration - elapsed),
      );
    } else this.frame = requestAnimationFrame(this.tick);
  }
  private stageChanged(stage: Stage): void {
    const dx = (stage.peak?.x ?? stage.to.x) - stage.from.x;
    const metadata: MotionMetadata = {
      ...(stage.facing
        ? { facing: stage.facing }
        : Math.abs(dx) > 0.5
          ? { facing: dx < 0 ? (-1 as const) : (1 as const) }
          : {}),
      ...(stage.arrival ? { arrival: stage.arrival } : {}),
      ...(stage.activity ? { activity: stage.activity, durationMs: stage.duration } : {}),
      ...(stage.sample ? { progress: stage.sample.from } : {}),
    };
    if (metadata.facing) this.facing = metadata.facing;
    this.notify(stage.phase, metadata);
  }
  private valid(): boolean {
    return !this.destroyed && !!this.placement && !!this.viewport;
  }
  private sample(): number {
    try {
      const value = this.random();
      return Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
    } catch {
      return 0.5;
    }
  }
  private ground(): number {
    if (!this.placement || !this.viewport) return 0;
    return (
      this.viewport.top + this.viewport.height - (this.size * 11) / 12 - this.placement.launcherTop
    );
  }
  private home(): Point {
    return this.bounded({ x: this.restingX ?? 0, y: this.ground() });
  }
  private bounds(): { left: number; right: number; top: number; bottom: number } {
    if (!this.placement || !this.viewport) return { left: 0, right: 0, top: 0, bottom: 0 };
    const gap = 4;
    const left = this.viewport.left + gap - this.placement.launcherLeft;
    const top = this.viewport.top + gap - this.placement.launcherTop;
    return {
      left,
      top,
      right: Math.max(
        left,
        this.viewport.left + this.viewport.width - this.size - gap - this.placement.launcherLeft,
      ),
      bottom: Math.max(top, this.ground()),
    };
  }
  private horizontalBounded(point: Point, peek = false): Point {
    const bounds = this.bounds();
    const outside = peek
      ? Math.max(0, this.size - Math.min(48, this.size, this.viewport?.width ?? this.size) + 4)
      : 0;
    return { x: clamp(point.x, bounds.left - outside, bounds.right + outside), y: point.y };
  }
  private horizontalRecoveryRequired(point: Point): boolean {
    if (!this.placement || !this.viewport) return false;
    const left = this.placement.launcherLeft + point.x;
    const visible = Math.max(
      0,
      Math.min(left + this.size, this.viewport.left + this.viewport.width) -
        Math.max(left, this.viewport.left),
    );
    return visible < Math.min(48, this.size, this.viewport.width) - 0.5;
  }
  private bounded(point: Point, peek = false): Point {
    const bounds = this.bounds();
    const outside = peek
      ? Math.max(0, this.size - Math.min(48, this.size, this.viewport?.width ?? this.size) + 4)
      : 0;
    return {
      x: clamp(point.x, bounds.left - outside, bounds.right + outside),
      y: clamp(point.y, bounds.top, bounds.bottom),
    };
  }
  private dragBounded(point: Point): Point {
    const bounded = this.bounded(point);
    const fullCanvasBottom =
      this.viewport && this.placement
        ? this.viewport.top + this.viewport.height - this.size - 4 - this.placement.launcherTop
        : bounded.y;
    return { x: bounded.x, y: Math.min(bounded.y, Math.max(this.bounds().top, fullCanvasBottom)) };
  }
  private apply(point: Point, stageProgress?: number): void {
    this.current = { ...point };
    const bounds = this.bounds();
    this.outside = point.x < bounds.left || point.x > bounds.right;
    const x = Math.round(point.x * 100) / 100;
    const y = Math.round(point.y * 100) / 100;
    this.launcher.style.transform =
      x === 0 && y === 0
        ? this.originalTransform
        : ('translate3d(' + x + 'px, ' + y + 'px, 0) ' + this.originalTransform).trim();
    try {
      const route = this.route;
      const stage = route?.stages[route.phaseIndex];
      if (route && stage?.sample) {
        let progress = stageProgress;
        if (progress === undefined) {
          let elapsed = performance.now() - route.startedAt;
          for (let index = 0; index < route.phaseIndex; index++) elapsed -= route.stages[index]!.duration;
          progress = clamp(elapsed / stage.duration, 0, 1);
        }
        const weight = stage.curve === 'linear' ? progress : ease(progress);
        this.onPosition({ ...this.current }, { activity: stage.activity,
          progress: stage.sample.from + (stage.sample.to - stage.sample.from) * weight });
      } else this.onPosition({ ...this.current });
    } catch {
      /* Speech positioning cannot break a finite path. */
    }
  }
  private clearGeometryFrame(): void {
    if (this.geometryFrame !== null) cancelAnimationFrame(this.geometryFrame);
    this.geometryFrame = null;
  }
  private notify(phase: MotionPhase, metadata?: MotionMetadata): void {
    try {
      if (metadata && Object.keys(metadata).length) this.onMoving(phase, metadata);
      else this.onMoving(phase);
    } catch {
      /* Decorative callbacks cannot break the store. */
    }
  }
}
