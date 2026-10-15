import type { AssistantConfig, QuietScene, ShopContext, ShopEvent } from '../config/types';
import { validateShopEvent } from '../config/validate';
import type { AnimationState, PoseName } from '../animation/manifest';
import type { MotionKind } from '../positioning/personality';
import { PersonalityVariation, type ReplyKind } from './variation';

export type PanelScreen = 'home' | 'categories' | 'settings';
export type InterfaceState = 'closed' | 'open' | 'hiddenByUser' | 'suppressed';
type MicroGesture = 'idle' | 'wave' | 'wink' | QuietScene;
export const QUIET_GESTURES = ['sit', 'scratch', 'ears', 'stretch', 'nose', 'guitar'] as const;
export interface ScenarioPreferences {
  hidden: boolean;
  motion: 'system' | 'off';
  lastGreetingAt: number | null;
}
export interface ScenarioSnapshot {
  state: InterfaceState;
  screen: PanelScreen;
  animation: AnimationState;
  sleeping: boolean;
  greetingVisible: boolean;
  greetingText: string;
  pose: PoseName | null;
  context: ShopContext | null;
}
export interface ScenarioHooks {
  change(): void;
  animate(state: AnimationState, repetitions?: number): void;
  pause?(): void;
  recover?(): void;
  motion?(scene: MotionKind): void;
  pose?(pose: PoseName | null): void;
  greeted(at: number): void;
}

/** Finite deadlines are paused together; this controller never polls or owns a rendering loop. */
export class ScenarioController {
  readonly blockers = new Set<string>();
  snapshot: ScenarioSnapshot = {
    state: 'suppressed', screen: 'home', animation: 'static', sleeping: false,
    greetingVisible: false, context: null,
    greetingText: '',
    pose: null,
  };
  private preferences: ScenarioPreferences;
  private reduced = false;
  private compact = false;
  private persistent = false;
  private active = false;
  private ready = true;
  private destroyed = false;
  private lastRevision = -1;
  private lastReaction = -Infinity;
  private lastScroll = -Infinity;
  private scrolling = false;
  private interactionHeld = false;
  private greetingHeld = false;
  private lastPersonalityReaction = -Infinity;
  private physicallyBusy = false;
  private physicalWasUserInitiated = false;
  private firstPhysicalFinished = false;
  private pendingScene = false;
  private sleepDue = false;
  private lastMicro: MicroGesture = 'wave';
  private lastQuiet: QuietScene | null = null;
  private quietResolve: (() => void) | null = null;
  private microStarted = false;
  private lastWinkAt = Date.now();
  private lastAutonomousWaveAt = Date.now();
  private autonomousWaveCooldown = 15000;
  private autonomousWave = false;
  private reactionDepth = 0;
  private attentionShown = false;
  private personalityCooldown = 6000;
  private eventIds = new Set<string>();
  private timers = new Map<string, { remaining: number; deadline: number; id?: ReturnType<typeof setTimeout>; callback: () => void }>();

  constructor(private config: AssistantConfig, preferences: ScenarioPreferences, private hooks: ScenarioHooks,
    private variation = new PersonalityVariation()) {
    this.preferences = { ...preferences };
    if (this.config.behavior === 'lively') this.autonomousWaveCooldown = this.variation.between(12000, 18000);
  }

  get motionAllowed(): boolean { return !this.reduced && this.preferences.motion === 'system'; }
  get isScrolling(): boolean { return this.scrolling; }
  get interacting(): boolean { return this.physicallyBusy; }
  get interactionOnHold(): boolean { return this.interactionHeld; }

  /** Pause automatic deadlines while the view loads, retaining scroll activity. */
  setReady(ready: boolean): void {
    if (this.destroyed || this.ready === ready) return;
    this.ready = ready;
    this.reconcile();
  }

  setInteractionHold(hold: boolean, resumeAutomatic = true): void {
    if (this.destroyed || this.interactionHeld === hold) return;
    this.interactionHeld = hold;
    if (!resumeAutomatic) this.reactionDepth++;
    try { this.reconcile(); }
    finally { if (!resumeAutomatic) this.reactionDepth--; }
  }

  clearPoseForLook(): void {
    if (this.destroyed || !this.interactionHeld || this.snapshot.animation !== 'static' || !this.snapshot.pose) return;
    this.snapshot.pose = null;
    this.cancel('pose');
    this.hooks.change();
  }
  get allowed(): boolean {
    const context = this.snapshot.context;
    return !!context && this.config.enabled && !this.config.disabledPageTypes.includes(context.pageType);
  }
  get available(): boolean {
    return this.allowed && !this.preferences.hidden && this.blockers.size === 0 &&
      !!this.snapshot.context?.ui.floatingAllowed && !this.snapshot.context?.ui.blockers.length;
  }

  setPreferences(preferences: ScenarioPreferences, persistent: boolean): void {
    this.preferences = { ...preferences };
    this.persistent = persistent;
    this.variation.setPermission(persistent);
    if (!this.motionAllowed) { this.interactionHeld = false; this.stopAutomatic(); this.animate('static'); }
    if (!persistent) this.cancel('greeting');
    this.reconcile();
    if (this.motionAllowed) this.resumeAutomatic();
  }

  setEnvironment(compact: boolean, reduced: boolean): void {
    const changed = this.compact !== compact || this.reduced !== reduced;
    this.compact = compact;
    this.reduced = reduced;
    if (changed) {
      if (!this.motionAllowed) { this.interactionHeld = false; this.stopAutomatic(); this.animate('static'); }
      if (this.config.behavior === 'lively') this.resumeAutomatic();
      else this.scheduleIdle();
      this.hooks.change();
    }
  }

  context(context: ShopContext): boolean {
    if (this.destroyed || context.revision <= this.lastRevision) return false;
    this.lastRevision = context.revision;
    const hadContext = !!this.snapshot.context;
    const pageChanged = this.snapshot.context?.pageKey !== context.pageKey;
    this.snapshot.context = context;
    if (pageChanged) {
      this.snapshot.state = 'closed';
      this.snapshot.screen = 'home';
      this.snapshot.greetingVisible = false;
      this.cancel('bubble');
      if (this.config.behavior === 'lively' && hadContext) {
        this.activity();
        this.reconcile();
        return true;
      }
      this.clearTimers();
      this.pendingScene = false;
      this.sleepDue = false;
      this.firstPhysicalFinished = false;
      this.snapshot.sleeping = false;
      this.snapshot.pose = null;
      this.animate('static');
      this.schedule('sleep', this.config.timings.sleepAfterMs, () => this.sleep());
      this.planGreeting();
      this.scheduleIdle(this.config.behavior === 'lively' ? this.variation.between(400, 1000) : undefined);
      this.scheduleScene(this.variation.between(3000, 5000));
      if (this.config.behavior === 'lively' && !this.attentionShown) this.schedule('attention', this.variation.between(35000, 60000), () => {
        if (!this.available || this.physicallyBusy || this.snapshot.sleeping || this.snapshot.state === 'open' || !this.canYieldAnimation()) return;
        this.attentionShown = true;
        this.animate('wave');
        if (!this.compact && this.variation.chance(.45)) this.speak(this.variation.reply('welcome'), 4500);
      });
    }
    this.reconcile();
    return true;
  }

  block(reason: string, blocked: boolean): void {
    if (blocked) this.blockers.add(reason);
    else this.blockers.delete(reason);
    this.reconcile();
  }

  open(): boolean {
    if (!this.available || this.destroyed) return false;
    const wake = this.snapshot.sleeping;
    this.snapshot.state = 'open';
    this.snapshot.screen = 'home';
    this.snapshot.greetingVisible = false;
    this.cancel('greeting');
    this.cancel('bubble');
    this.activity();
    this.animate(wake ? 'wake' : 'wave');
    this.hooks.change();
    return true;
  }

  pet(): void {
    if (!this.available || this.destroyed) return;
    const sleeping = this.snapshot.sleeping;
    this.reaction(() => {
      this.activity();
      this.cancel('greeting');
      this.cancel('attention');
      this.animate(sleeping ? 'wake' : 'wave');
      this.speak(this.variation.reply(sleeping ? 'wake' : 'pet'), 4500);
    });
  }

  react(kind: 'product:enter' | 'product:leave' | 'cart:error' | 'pointer:near'): void {
    if (this.config.behavior !== 'lively' || !this.available || this.destroyed || !this.motionAllowed || this.scrolling || this.physicallyBusy || this.interactionHeld) return;
    if (kind !== 'cart:error' && QUIET_GESTURES.includes(this.snapshot.animation as QuietScene)) return;
    if (kind === 'product:leave') return;
    const now = Date.now();
    if (kind !== 'cart:error' && now - this.lastPersonalityReaction < this.personalityCooldown) return;
    this.lastPersonalityReaction = now;
    this.personalityCooldown = kind === 'pointer:near' ? this.variation.between(12000, 15000) : this.variation.between(9000, 16000);
    this.reaction(() => {
      this.activity();
      this.cancel('attention');
      this.cancel('greeting');
      if (kind === 'cart:error') {
        this.animate('static');
        this.snapshot.pose = 'sympathetic';
        this.hooks.pose?.('sympathetic');
        this.speak(this.variation.reply('error'), 4500);
      }
      else if (kind === 'pointer:near') { this.animate('wave'); }
      else {
        this.snapshot.pose = 'curious';
        this.animate('idle');
        this.hooks.pose?.('curious');
        if (!this.compact && this.variation.chance(.55)) this.speak(this.variation.reply('interest'), 4000);
        else this.schedule('pose', 4000, () => { this.snapshot.pose = null; this.hooks.pose?.(null); this.resumeAutomatic(); });
      }
    });
  }

  dismissSpeech(): void { this.snapshot.greetingVisible = false; this.cancel('bubble'); this.hooks.change(); }

  performQuiet(scene: QuietScene): Promise<void> {
    if (this.config.behavior !== 'lively' || !this.available || this.destroyed || !this.motionAllowed ||
        !QUIET_GESTURES.includes(scene)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.reaction(() => {
        this.endPhysical(false);
        this.activity();
        this.cancel('idle');
        this.cancel('greeting');
        this.cancel('attention');
        this.dismissSpeech();
        this.animate(scene, 1, false, resolve);
      });
    });
  }

  perform(scene: MotionKind, userInitiated = true): void {
    if (this.config.behavior !== 'lively' || !this.available || this.destroyed || !this.motionAllowed ||
        !this.hooks.motion || ((this.scrolling || this.interactionHeld) && !userInitiated)) return;
    if (!userInitiated && (this.physicallyBusy || this.snapshot.sleeping || this.snapshot.pose ||
      !this.canYieldAnimation())) {
      this.pendingScene = true;
      return;
    }
    if (userInitiated && this.scrolling) {
      this.scrolling = false;
      this.cancel('scroll-settle');
      this.reconcile();
    }
    this.pendingScene = false;
    if (userInitiated) this.activity();
    this.dismissSpeech();
    const animation = scene === 'climb' ? 'climb' : scene === 'wiggle' ? 'wiggle' : scene === 'flip' ? 'flip' : 'walk';
    this.animate(animation, scene === 'stroll' ? 4 : scene === 'climb' ? 4 : scene === 'peek' ? 3 : 1);
    this.beginPhysical(userInitiated);
    this.firstPhysicalFinished = true;
    this.hooks.motion?.(scene);
    if (scene === 'peek' && this.variation.chance(.4)) this.speak(this.variation.reply('peek'), 3200);
    if ((scene === 'wiggle' || scene === 'flip') && this.variation.chance(.35)) this.speak(this.variation.reply(scene === 'wiggle' ? 'tail' : 'flip'), 3200);
  }

  beginPhysical(userInitiated = false): boolean {
    if (this.config.behavior !== 'lively' || !this.available || this.destroyed || (this.scrolling && !userInitiated)) return false;
    this.finishQuiet();
    if (this.physicallyBusy) return true;
    if (userInitiated) {
      if (this.scrolling) { this.scrolling = false; this.cancel('scroll-settle'); this.reconcile(); }
      this.activity();
    }
    this.physicallyBusy = true;
    this.autonomousWave = false;
    this.physicalWasUserInitiated = userInitiated;
    this.snapshot.sleeping = false;
    this.snapshot.pose = null;
    this.cancel('pose');
    this.cancel('greeting');
    this.cancel('attention');
    this.cancel('idle');
    this.cancel('scene');
    this.pendingScene = false;
    this.dismissSpeech();
    return true;
  }

  physicalStage(animation: AnimationState): void {
    this.autonomousWave = false;
    this.snapshot.animation = this.motionAllowed ? animation : 'static';
    this.hooks.change();
  }

  physicalSpeech(kind: ReplyKind, duration = 2500): void { this.speak(this.variation.reply(kind), duration); }

  endPhysical(clearAnimation = true): void {
    if (!this.physicallyBusy) return;
    const manual = this.physicalWasUserInitiated;
    this.physicallyBusy = false;
    this.physicalWasUserInitiated = false;
    if (clearAnimation) this.snapshot.animation = 'static';
    this.autonomousWave = false;
    if (manual && this.available && !this.destroyed) {
      this.sleepDue = false;
      this.schedule('sleep', this.config.timings.sleepAfterMs, () => this.sleep());
    }
    this.hooks.change();
    if (clearAnimation && !this.destroyed && this.config.behavior === 'lively') {
      if (this.sleepDue) { this.sleep(); return; }
      if (this.available && this.motionAllowed && !this.scrolling && !this.snapshot.sleeping) {
        this.scheduleIdle(this.variation.between(400, 1000));
        this.scheduleScene(this.firstPhysicalFinished ? this.variation.between(5000, 9000) : this.variation.between(3000, 5000));
        this.firstPhysicalFinished = true;
      }
    }
  }

  close(): void {
    if (this.snapshot.state === 'open') this.snapshot.state = 'closed';
    this.activity();
    this.reconcile();
  }

  screen(screen: PanelScreen): void {
    if (this.snapshot.state !== 'open') return;
    this.snapshot.screen = screen;
    this.activity();
    this.hooks.change();
  }

  activity(scroll = false): void {
    if (this.destroyed || !this.available) return;
    this.sleepDue = false;
    if (!scroll && this.snapshot.pose) { this.snapshot.pose = null; this.hooks.pose?.(null); this.cancel('pose'); }
    if (scroll) {
      const wasScrolling = this.scrolling;
      this.scrolling = true;
      this.lastScroll = Date.now();
      this.snapshot.pose = null;
      this.cancel('pose');
      if (this.config.behavior === 'calm') {
        this.autonomousWave = false;
        this.physicallyBusy = false;
        this.physicalWasUserInitiated = false;
        if (!wasScrolling) {
          this.snapshot.animation = 'static';
          if (this.hooks.pause) this.hooks.pause(); else this.hooks.animate('static');
          this.hooks.change();
        }
      }
      this.reconcile();
      // Lively clips and physics finish normally; only new automatic activity waits.
      this.schedule('scroll-settle', 500, () => {
        this.scrolling = false;
        this.reconcile();
        this.hooks.recover?.();
        this.resumeAutomatic();
      }, true);
    }
    if (this.snapshot.sleeping) {
      this.snapshot.sleeping = false;
      if (!scroll || this.config.behavior === 'lively') this.animate('static');
      this.scheduleIdle();
      if (!this.timers.has('scene')) this.scheduleScene();
    }
    this.schedule('sleep', this.config.timings.sleepAfterMs, () => this.sleep());
  }

  cart(event: Extract<ShopEvent, { type: 'cart:added' }>): boolean {
    if (this.destroyed || !validateShopEvent(event)) return false;
    if (this.eventIds.has(event.id)) return false;
    this.eventIds.add(event.id);
    if (this.eventIds.size > 100) this.eventIds.delete(this.eventIds.values().next().value!);
    const now = Date.now();
    if (now - event.occurredAt > 5000 || event.occurredAt - now > 1000 || !this.available ||
        now - this.lastReaction < this.config.timings.cartReactionCooldownMs || this.snapshot.state === 'open' || !this.motionAllowed || this.scrolling || this.physicallyBusy) return false;
    this.lastReaction = now;
    this.cancel('greeting');
    this.snapshot.greetingVisible = false;
    this.reaction(() => {
      this.activity();
      this.animate('happy');
      if (this.config.behavior === 'lively') this.speak(this.variation.reply('success'), 4000);
    });
    return true;
  }

  holdGreeting(hold: boolean): void {
    this.greetingHeld = hold;
    const timer = this.timers.get('bubble');
    if (!timer) return;
    if (hold && timer.id !== undefined) {
      clearTimeout(timer.id); timer.id = undefined;
      timer.remaining = Math.max(0, timer.deadline - Date.now());
    } else if (!hold && timer.id === undefined && this.active) this.startTimer('bubble', timer);
  }

  finishAnimation(): void {
    if (this.destroyed || this.physicallyBusy) return;
    this.finishQuiet();
    this.snapshot.animation = 'static';
    this.autonomousWave = false;
    this.hooks.change();
    this.resumeAutomatic(true);
  }

  destroy(): void {
    this.destroyed = true;
    this.interactionHeld = false;
    this.clearTimers();
    this.pendingScene = false;
    this.sleepDue = false;
    this.blockers.clear();
    this.eventIds.clear();
    this.animate('static');
  }

  private reconcile(): void {
    if (this.destroyed) return;
    const available = this.available;
    if (!available) {
      this.interactionHeld = false;
      this.snapshot.state = this.preferences.hidden ? 'hiddenByUser' : 'suppressed';
      this.snapshot.greetingVisible = false;
      this.animate('static');
    } else if (this.snapshot.state === 'hiddenByUser' || this.snapshot.state === 'suppressed') this.snapshot.state = 'closed';
    const timerActive = this.ready && available && !this.scrolling && !this.interactionHeld;
    if (this.active !== timerActive) {
      this.active = timerActive;
      for (const [name, timer] of this.timers) {
        if (name === 'scroll-settle') continue;
        if (timerActive && !(name === 'bubble' && this.greetingHeld)) this.startTimer(name, timer);
        else if (timer.id !== undefined) {
          clearTimeout(timer.id); timer.id = undefined;
          timer.remaining = Math.max(0, timer.deadline - Date.now());
        }
      }
    }
    this.hooks.change();
    if (timerActive) this.resumeAutomatic();
  }

  private planGreeting(): void {
    const last = this.preferences.lastGreetingAt;
    if (!this.persistent || !this.motionAllowed || (last !== null && Date.now() - last < this.config.timings.greetingRepeatDays * 86400000)) return;
    this.schedule('greeting', this.config.timings.greetingDelayMs, () => {
      if (!this.available || this.snapshot.state === 'open' || !this.motionAllowed || !this.persistent) return;
      const sinceScroll = Date.now() - this.lastScroll;
      if (sinceScroll < 2000) { this.schedule('greeting', 2000 - sinceScroll, () => this.greet()); return; }
      this.greet();
    });
  }

  private greet(): void {
    if (!this.available || this.snapshot.state === 'open' || !this.motionAllowed || !this.persistent) return;
    const at = Date.now();
    this.preferences.lastGreetingAt = at;
    this.hooks.greeted(at);
    this.animate('wave');
    this.snapshot.greetingText = this.config.behavior === 'lively' ? this.variation.reply('welcome') : this.config.texts.greeting;
    if (!this.compact) {
      this.snapshot.greetingVisible = true;
      this.schedule('bubble', 6000, () => { this.snapshot.greetingVisible = false; this.hooks.change(); });
      this.hooks.change();
    }
  }

  private sleep(): void {
    if (!this.available || this.snapshot.state === 'open' || !this.motionAllowed) return;
    if (this.config.behavior === 'lively' && (this.physicallyBusy || this.snapshot.pose || !this.canYieldAnimation())) {
      this.sleepDue = true;
      this.cancel('idle'); this.cancel('scene'); this.pendingScene = false;
      return;
    }
    this.sleepDue = false;
    this.snapshot.sleeping = true;
    this.cancel('idle');
    this.cancel('scene');
    this.pendingScene = false;
    this.animate('sleep');
  }

  private scheduleIdle(delayOverride?: number): void {
    if (this.destroyed) return;
    const configured = this.compact ? this.config.timings.idleCompactMs : this.config.timings.idleDesktopMs;
    if (this.config.behavior === 'lively' && !this.motionAllowed) { this.cancel('idle'); return; }
    const delay = delayOverride ?? (this.config.behavior === 'lively' ? this.variation.between(1200, 2500) : configured);
    this.schedule('idle', delay, () => {
      if (this.available && !this.scrolling && !this.interactionHeld && !this.physicallyBusy && this.snapshot.state === 'closed' && !this.snapshot.sleeping &&
          !this.snapshot.pose && this.snapshot.animation === 'static' && this.motionAllowed) {
        let gesture: MicroGesture = 'idle';
        if (this.config.behavior === 'lively' && this.microStarted) {
          if (Date.now() - this.lastWinkAt >= 35000 && this.variation.chance(.15)) gesture = 'wink';
          else if (Date.now() - this.lastAutonomousWaveAt >= this.autonomousWaveCooldown && this.variation.chance(.3)) gesture = 'wave';
          else if (!QUIET_GESTURES.includes(this.lastMicro as typeof QUIET_GESTURES[number]) && this.variation.chance(.2)) {
            const choices = QUIET_GESTURES.filter((quiet) => quiet !== this.lastQuiet);
            gesture = choices[this.variation.between(0, choices.length - 1)]!;
          }
        }
        this.animate(gesture, 1, this.config.behavior === 'lively');
      }
      if (this.config.behavior === 'calm') this.scheduleIdle();
    });
  }

  private animate(state: AnimationState, repetitions = 1, autonomousMicro = false, quietResolve?: () => void): void {
    this.finishQuiet();
    this.snapshot.animation = this.motionAllowed ? state : 'static';
    if (quietResolve) {
      if (this.motionAllowed) this.quietResolve = quietResolve;
      else quietResolve();
    }
    if (this.motionAllowed && QUIET_GESTURES.includes(state as QuietScene)) this.lastQuiet = state as QuietScene;
    this.autonomousWave = autonomousMicro && this.motionAllowed && state === 'wave';
    if (autonomousMicro && this.motionAllowed && ['idle', 'wave', 'wink', ...QUIET_GESTURES].includes(state)) {
      this.lastMicro = state as MicroGesture;
      this.microStarted = true;
      if (state === 'wink') this.lastWinkAt = Date.now();
      if (state === 'wave') {
        this.lastAutonomousWaveAt = Date.now();
        this.autonomousWaveCooldown = this.variation.between(12000, 18000);
      }
    }
    this.hooks.animate(this.snapshot.animation, repetitions);
    this.hooks.change();
  }

  private canYieldAnimation(): boolean {
    return ['static', 'idle', 'wink'].includes(this.snapshot.animation) ||
      (this.snapshot.animation === 'wave' && this.autonomousWave);
  }

  private finishQuiet(): void {
    const resolve = this.quietResolve;
    this.quietResolve = null;
    resolve?.();
  }

  private scheduleScene(delay = this.firstPhysicalFinished ? this.variation.between(5000, 9000) : this.variation.between(3000, 5000)): void {
    if (this.config.behavior !== 'lively' || this.destroyed || !this.motionAllowed || !this.hooks.motion) return;
    this.schedule('scene', delay, () => {
      this.pendingScene = true;
      this.tryPendingScene();
    });
  }

  private tryPendingScene(): boolean {
    if (!this.pendingScene || !this.available || this.scrolling || this.interactionHeld || this.physicallyBusy || this.snapshot.sleeping ||
      this.snapshot.pose || !this.canYieldAnimation() || !this.motionAllowed || this.destroyed) return false;
    this.pendingScene = false;
    this.perform(this.variation.scene(), false);
    return true;
  }

  private resumeAutomatic(afterClip = false): void {
    if (this.config.behavior !== 'lively' || !this.ready || this.destroyed || this.reactionDepth > 0 || !this.available || this.scrolling || this.interactionHeld || this.physicallyBusy ||
      !this.motionAllowed || this.snapshot.sleeping) return;
    if (this.sleepDue) { this.sleep(); if (this.snapshot.sleeping || this.sleepDue) return; }
    if (this.tryPendingScene()) return;
    if (!this.pendingScene && !this.timers.has('scene')) this.scheduleScene();
    if (!this.snapshot.pose && this.snapshot.animation === 'static' && (afterClip || !this.timers.has('idle'))) this.scheduleIdle();
  }

  private reaction(callback: () => void): void {
    this.reactionDepth++;
    try { callback(); }
    finally { this.reactionDepth--; }
    this.resumeAutomatic();
  }

  private stopAutomatic(): void {
    if (this.config.behavior !== 'lively') return;
    this.cancel('idle'); this.cancel('scene'); this.pendingScene = false;
  }

  private speak(text: string, duration: number): void {
    this.snapshot.greetingText = text;
    this.snapshot.greetingVisible = true;
    this.schedule('bubble', duration, () => {
      this.snapshot.greetingVisible = false;
      if (this.snapshot.pose) { this.snapshot.pose = null; this.hooks.pose?.(null); this.resumeAutomatic(); }
      this.hooks.change();
    });
    this.hooks.change();
  }

  private schedule(name: string, remaining: number, callback: () => void, force = false): void {
    this.cancel(name);
    const timer = { remaining, deadline: 0, callback, id: undefined as ReturnType<typeof setTimeout> | undefined };
    this.timers.set(name, timer);
    if ((this.active || force) && !(name === 'bubble' && this.greetingHeld)) this.startTimer(name, timer);
  }

  private startTimer(name: string, timer: { remaining: number; deadline: number; id?: ReturnType<typeof setTimeout>; callback: () => void }): void {
    if (timer.id !== undefined) return;
    timer.deadline = Date.now() + timer.remaining;
    timer.id = setTimeout(() => {
      this.timers.delete(name);
      if (!this.destroyed) timer.callback();
    }, timer.remaining);
  }

  private cancel(name: string): void {
    const timer = this.timers.get(name);
    if (timer?.id !== undefined) clearTimeout(timer.id);
    this.timers.delete(name);
  }
  private clearTimers(): void { for (const name of this.timers.keys()) this.cancel(name); }
}
