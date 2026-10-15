import type { AssistantAnalyticsEvent, AssistantConfig, AssistantInstance, AssistantScene, OverlaySession, QuietScene, ShopAdapter, ShopContext, ShopEvent } from '../config/types';
import { validateShopContext, validateShopEvent } from '../config/validate';
import { createPreferencesStore, type PreferencesStore } from '../storage/preferences';
import { SpritePlayer } from '../animation/player';
import { QUIET_GESTURES, ScenarioController } from './scenarios';
import { createAssistantElement, type AssistantElement } from '../ui/element';
import { ViewportObserver, visibleViewport, type Viewport } from '../positioning/viewport';
import { PersonalityMotion, type MotionKind, type MotionPhase, type MotionMetadata } from '../positioning/personality';
import { PersonalityVariation } from './variation';
import type { MotionClipName, PoseName } from '../animation/manifest';
import type { PreparedGraphics } from '../animation/preflight';

const PHASE_CLIPS: Record<Exclude<MotionPhase, null>, MotionClipName> = {
  arrival: 'walk', stroll: 'walk', peek: 'walk', return: 'walk', hide: 'walk',
  climb: 'climb', wiggle: 'wiggle', flip: 'flip', drag: 'held', fall: 'fall', parachute: 'parachute', land: 'land',
  'page-push': 'walk',
};
const PAGE_PUSH_STEP_REPETITIONS = 2;

export class AssistantRuntime implements AssistantInstance {
  private view: AssistantElement;
  private player: SpritePlayer;
  private controller: ScenarioController;
  private preferences: PreferencesStore;
  private viewport: ViewportObserver;
  private motion: PersonalityMotion;
  private motionResult: Promise<void> = Promise.resolve();
  private replacingMotion = false;
  private variation: PersonalityVariation;
  private dragGesture: { id: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null = null;
  private suppressClickUntil = 0;
  private entering = false;
  private motionActivity: MotionMetadata['activity'] | null = null;
  private motionWalkUntil = 0;
  private arrivalPending = false;
  private routeScrollUntil = 0;
  private abort = new AbortController();
  private compactQuery = window.matchMedia('(max-width: 767px), (hover: none) and (pointer: coarse)');
  private reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private compact = this.compactQuery.matches;
  private overlay: OverlaySession | null = null;
  private opening: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private destruction: Promise<void> | null = null;
  private navigating = false;
  private destroyed = false;
  private pageSuspended = false;
  private pageRestorePending = false;
  private ready = false;
  private pageStyles = document.createElement('link');
  private openingGeneration = 0;
  private closeRequestGeneration = 0;
  private caller: HTMLElement | null = null;
  private ownsScrollLock = false;
  private shown = false;
  private pointerFrame = 0;
  private pointerNear = false;
  private pointerLooking = false;
  private cursor = { x: 0, y: 0 };
  private paletteLook: { x: number; y: number } | null = null;
  private greetingHeld = false;
  private pagePush: { side: 'left' | 'right'; ready: boolean; pushing: boolean; reserved: number; pageKey: string; committed: boolean; viewport: Viewport;
    windowWidth: number; windowHeight: number; viewportScale: number;
    cancelled: Promise<boolean>; cancel(): void } | null = null;
  private lastGeometry: { viewport: Viewport; reserved: number; size: number } | null = null;

  constructor(private config: AssistantConfig, private adapter: ShopAdapter,
    initial: ShopContext, private unsubscribe: () => void, graphics?: PreparedGraphics) {
    this.view = createAssistantElement(graphics?.poster);
    document.body.append(this.view);
    this.variation = new PersonalityVariation({ permission: initial.permissions.persistentSettings });
    this.preferences = createPreferencesStore({
      persistentSettings: initial.permissions.persistentSettings,
      onChange: (preferences) => {
        const appearing = this.entering;
        this.controller?.setPreferences(preferences, this.preferences.persistent);
        this.player?.setEnabled(preferences.motion === 'system' && !this.reducedQuery.matches);
        if (appearing && preferences.motion === 'off') this.motion?.spawn();
        this.render();
        this.recoverPosition();
      },
    });
    this.controller = new ScenarioController(config, this.preferences.get(), {
      change: () => this.render(),
      animate: (state, repetitions) => {
        this.cancelMotion();
        this.player?.setFacing(1);
        if (state === 'static') this.player?.stop();
        else if (this.player?.play(state, repetitions) === false && QUIET_GESTURES.includes(state as QuietScene)) this.controller.finishAnimation();
      },
      pause: () => { this.cancelMotion(); this.player?.pause(); },
      recover: () => this.resumeAfterScroll(),
      motion: (scene) => {
        this.controller.beginPhysical();
        this.motionResult = this.motion.run(scene, { headOnly: scene === 'peek' && this.variation.chance(.5) });
      },
      pose: (pose) => {
        if (pose) { this.player?.setFacing(1); this.player?.look(pose); }
        else { this.player?.stop(); this.controller.finishAnimation(); }
      },
      greeted: (at) => this.preferences.update({ lastGreetingAt: at }),
    }, this.variation);
    this.player = new SpritePlayer(this.view.canvas, this.view.poster, config.assets, (result) => {
      if (this.pageSuspended) return;
      if (this.motion?.moving) {
        // Scrolling defers new lively scenes, but an active route keeps walking.
        if (result === 'completed' && this.motionActivity === 'walk' && this.controller.motionAllowed &&
            (this.config.behavior === 'lively' || !this.controller.isScrolling) &&
            performance.now() < this.motionWalkUntil) this.continueWalking();
        return;
      }
      if (this.pagePush) return;
      this.controller.finishAnimation();
      if (this.controller.snapshot.pose) { this.player.setFacing(1); this.player.look(this.controller.snapshot.pose); }
      this.recoverPosition();
      if (this.paletteLook) this.lookAt(this.paletteLook);
    }, graphics, () => this.view.updateHitRegion());
    this.motion = new PersonalityMotion(this.view.launcher, (phase, metadata) => this.motionStage(phase, metadata),
      (offset, metadata) => {
        if (metadata) this.drawPageApproach(metadata);
        this.updateSpeechPosition(offset);
      });
    this.player.setEnabled(this.preferences.get().motion === 'system' && !this.reducedQuery.matches);
    this.viewport = new ViewportObserver(() => this.position());
    this.pageStyles.rel = 'stylesheet'; this.pageStyles.href = config.assets.cssUrl;
    this.pageStyles.dataset.animeAssistantStyles = '1';
    document.head.append(this.pageStyles);
    this.controller.setReady(false);
    this.controller.setEnvironment(this.compact, this.reducedQuery.matches);
    this.controller.setPreferences(this.preferences.get(), this.preferences.persistent);
    this.receive({ type: 'context', context: initial });
    const options = { signal: this.abort.signal };
    this.compactQuery.addEventListener('change', () => { void this.changeLayout().catch(() => this.destroy()); }, options);
    this.reducedQuery.addEventListener('change', () => {
      if (this.reducedQuery.matches) this.setInteractionHold(false);
      const appearing = this.entering;
      this.player.setEnabled(this.preferences.get().motion === 'system' && !this.reducedQuery.matches);
      this.controller.setEnvironment(this.compact, this.reducedQuery.matches);
      if (appearing && this.reducedQuery.matches) this.motion.spawn();
      this.render();
      this.recoverPosition();
    }, options);
    document.addEventListener('visibilitychange', () => {
      this.controller.block('hidden-tab', document.hidden);
      if (!document.hidden) {
        if (this.pageRestorePending) this.resumeSuspendedPage();
        else if (!this.pageSuspended) this.position();
      }
    }, options);
    window.addEventListener('pagehide', () => {
      this.pageSuspended = true;
      this.pageRestorePending = false;
      this.controller.block('page-suspended', true);
      this.finishPagePush(false);
      this.cancelMotion();
      this.player.stop();
      this.controller.finishAnimation();
    }, options);
    window.addEventListener('pageshow', () => {
      if (!this.pageSuspended || this.destroyed) return;
      this.pageRestorePending = true;
      this.resumeSuspendedPage();
    }, options);
    window.addEventListener('resize', () => this.finishPagePush(), options);
    document.addEventListener('pointerdown', (event) => {
      const inside = event.composedPath().includes(this.view);
      if (!inside && !this.compact && this.view.dialog.open) void this.closeInternal(false);
      if (!inside) this.controller.activity();
    }, { ...options, passive: true });
    if (config.behavior === 'lively') document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch' || this.dragGesture || !this.ready || !this.controller.available || !this.controller.motionAllowed || this.controller.isScrolling || this.controller.interacting) return;
      this.cursor = { x: event.clientX, y: event.clientY };
      if (!this.pointerFrame) this.pointerFrame = requestAnimationFrame(() => {
        this.pointerFrame = 0;
        if (this.destroyed || this.dragGesture || !this.controller.available || !this.controller.motionAllowed || this.controller.isScrolling || this.controller.interacting) return;
        const rect = this.view.launcher.getBoundingClientRect();
        const dx = this.cursor.x - (rect.left + rect.width / 2);
        const dy = this.cursor.y - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy);
        const near = distance < rect.width * .65;
        if (near && !this.pointerNear) this.controller.react('pointer:near');
        this.pointerNear = near;
        if (!this.controller.snapshot.sleeping && !this.controller.snapshot.pose && this.controller.snapshot.animation === 'static') {
          // Explicit attention to a scene button can reach above the character;
          // ordinary cursor tracking stays within one character size.
          if (this.controller.interactionOnHold && this.paletteLook) return;
          if (distance > rect.width) {
            if (this.pointerLooking) { this.player.stop(); this.pointerLooking = false; }
            return;
          }
          this.player.setFacing(1);
          this.player.look(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
          this.pointerLooking = true;
        }
      });
    }, { ...options, passive: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.dragGesture) {
        event.preventDefault(); this.finishDrag(true);
      } else if (event.key === 'Escape' && this.view.dialog.open && event.composedPath().includes(this.view)) {
        event.preventDefault(); void this.closeInternal(true);
      } else this.controller.activity();
    }, options);
    document.addEventListener('scroll', (event) => {
      if (this.motion.dragging || event.composedPath().includes(this.view)) return;
      const routeScroll = performance.now() < this.routeScrollUntil && window.scrollY === 0 &&
        (event.target === document || event.target === window);
      this.routeScrollUntil = 0;
      if (!routeScroll) this.controller.activity(true);
    }, { ...options, capture: true, passive: true });
    const updateFocus = () => {
      if (this.destroyed) return;
      const active = document.activeElement;
      const input = active instanceof HTMLElement && (active.matches('input,textarea') || active.isContentEditable);
      this.controller.block('field-focus', this.compact && input &&
        (this.config.behavior !== 'lively' || this.controller.snapshot.context?.pageType !== 'checkout'));
    };
    document.addEventListener('focusin', updateFocus, options);
    document.addEventListener('focusout', () => queueMicrotask(updateFocus), options);
    updateFocus();
    if (config.behavior === 'lively') this.setupDragging(options);
    this.controller.block('hidden-tab', document.hidden);
  }

  async attach(): Promise<boolean> {
    const styled = await this.view.setup(this.config, {
      toggle: () => { void (this.config.behavior === 'lively' ? this.open() : this.view.dialog.open ? this.close() : this.open()); },
      close: (returnFocus) => { void this.closeInternal(returnFocus); },
      screen: (screen) => { this.controller.screen(screen); this.view.focusFirst(); },
      navigate: (href, id) => { void this.navigate(href, id); },
      cart: () => { void this.navigate(this.config.routes.cart, 'cart', true); },
      motion: () => {
        const next = this.preferences.get().motion === 'off' ? 'system' : 'off';
        this.preferences.update({ motion: next });
        this.track('motion_changed');
      },
      hide: () => { void this.hide(); },
      holdGreeting: (hold) => { this.greetingHeld = hold; this.updateSpeechPosition(); },
      graphicsFailed: () => { void this.destroy(); },
    });
    if (!styled || this.destroyed) { await this.destroy(); return false; }
    this.ready = true;
    this.view.setCompact(this.compact);
    this.player.resize(this.compact ? 64 : 96);
    this.position();
    this.controller.setReady(true);
    if (this.config.behavior === 'lively' && this.controller.available) {
      if (this.controller.motionAllowed) {
        this.arrivalPending = this.controller.isScrolling;
        if (this.arrivalPending) this.motion.cancel(); else this.startArrival();
      } else this.motion.spawn();
    }
    this.render();
    return true;
  }

  receive(event: ShopEvent): void {
    if (this.destroyed || !validateShopEvent(event)) return;
    if (event.type === 'context') {
      const old = this.controller.snapshot.context;
      if (old && event.context.revision <= old.revision) return;
      this.variation.setPermission(event.context.permissions.persistentSettings);
      this.preferences.setPermission(event.context.permissions.persistentSettings);
      this.controller.setPreferences(this.preferences.get(), this.preferences.persistent);
      const pageChanged = old && old.pageKey !== event.context.pageKey;
      if (pageChanged && this.pagePush) {
        // Allow one covered commit per prepared push.
        if (!this.pagePush.ready || this.pagePush.committed) this.finishPagePush();
        else { this.pagePush.committed = true; this.pagePush.pageKey = event.context.pageKey; }
      }
      if (pageChanged && this.config.behavior === 'lively') this.routeScrollUntil = performance.now() + 200;
      if (pageChanged && this.config.behavior === 'calm') this.cancelMotion(true);
      this.controller.context(event.context);
      if (pageChanged || !this.controller.available) void this.closeInternal(false);
      this.position();
    } else if (event.type === 'cart:added') this.controller.cart(event);
    else if (event.type === 'interaction') this.controller.react(event.kind);
  }

  open(): Promise<void> {
    if (this.config.behavior === 'lively') {
      if (this.ready && !this.destroyed) {
        this.controller.pet(); this.track('opened');
        this.recoverPosition();
      }
      return Promise.resolve();
    }
    if (this.opening) return this.opening;
    if (!this.ready || this.destroyed || !this.controller.available || this.view.dialog.open) return Promise.resolve();
    this.opening = this.performOpen().catch(() => this.closeInternal(false)).finally(() => { this.opening = null; });
    return this.opening;
  }

  async close(): Promise<void> {
    if (this.destruction) { await this.destruction; return; }
    this.controller.dismissSpeech();
    await this.closeInternal(true);
    if (this.opening) await this.opening;
  }

  async setMotion(motion: 'system' | 'off'): Promise<void> {
    if (this.destroyed || !['system', 'off'].includes(motion)) return;
    if (motion === 'off') this.setInteractionHold(false);
    this.preferences.update({ motion });
    this.track('motion_changed');
  }

  setInteractionHold(hold: boolean): void {
    if (this.destroyed) return;
    if ((this.pagePush || this.pageSuspended) && !hold) return;
    if (!hold) this.paletteLook = null;
    this.controller.setInteractionHold(hold);
    if (hold && this.view.dataset.motion === 'stroll') {
      this.cancelMotion();
      this.player.stop();
      this.controller.finishAnimation();
    }
  }

  setSpeechExclusion(region: { left: number; top: number; width: number; height: number } | null): void {
    if (this.destroyed || (region && (!Object.values(region).every(Number.isFinite) || region.width < 0 || region.height < 0))) return;
    this.view.setSpeechExclusion(region);
    this.updateSpeechPosition();
  }

  lookAt(point: { x: number; y: number }): void {
    if (!this.ready || this.destroyed || !this.controller.available || !this.controller.motionAllowed ||
        !this.controller.interactionOnHold || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    // Discard any cursor update queued before this control was hovered.
    if (this.pointerFrame) { cancelAnimationFrame(this.pointerFrame); this.pointerFrame = 0; }
    this.paletteLook = { ...point };
    if (this.dragGesture || this.controller.interacting || this.controller.snapshot.sleeping ||
        this.controller.snapshot.animation !== 'static') return;
    this.controller.clearPoseForLook();
    const rect = this.view.launcher.getBoundingClientRect();
    const dx = point.x - (rect.left + rect.width / 2), dy = point.y - (rect.top + rect.height / 2);
    this.player.setFacing(1);
    const direction: PoseName = dy < 0 && Math.abs(dx) > Math.abs(dy) * .35
      ? (dx < 0 ? 'up-left' : 'up-right')
      : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    this.player.look(direction);
    this.pointerLooking = true;
  }

  async preparePagePush(side: 'left' | 'right'): Promise<boolean> {
    this.finishPagePush();
    if (!this.ready || this.destroyed || this.pageSuspended || this.config.behavior !== 'lively' || !this.controller.available ||
        !this.controller.motionAllowed || !['left', 'right'].includes(side) || this.dragGesture) return false;
    // Interrupt idle motion and approach the page edge from the current position.
    this.controller.setInteractionHold(true);
    this.cancelMotion();
    this.paletteLook = null;
    this.player.stop();
    this.render();
    let cancel = () => {};
    const cancelled = new Promise<boolean>((resolve) => { cancel = () => resolve(false); });
    const session = { side, ready: false, pushing: false,
      reserved: 0,
      pageKey: this.controller.snapshot.context?.pageKey ?? '', committed: false,
      viewport: visibleViewport(),
      windowWidth: window.innerWidth, windowHeight: window.innerHeight,
      viewportScale: window.visualViewport?.scale ?? 1, cancelled, cancel };
    this.pagePush = session;
    if (!this.controller.beginPhysical(true)) { this.finishPagePush(); return false; }
    // The fold, roll, unfolding and original push live on one lazy sheet.
    const push = side === 'left' ? 'push-right' : 'push-left';
    const unroll = side === 'left' ? 'unroll-right' : 'unroll-left';
    const approachClips: MotionClipName[] = this.motion.needsPageRoll(side, session.viewport)
      ? [push, 'curl', 'roll', unroll] : [push];
    const steps = await Promise.race([Promise.all(approachClips.map((clip) =>
      this.player.prepareClip(clip))).then((ready) => ready.every(Boolean)), cancelled]);
    if (this.pagePush !== session || this.destroyed || !this.controller.available || !this.controller.motionAllowed) return false;
    if (!steps) { this.finishPagePush(); return false; }
    this.position();
    this.motionResult = this.motion.approachPagePush(side, { settleToGround: true, pageViewport: session.viewport });
    await this.motionResult;
    if (this.pagePush !== session || this.destroyed || !this.controller.available || !this.controller.motionAllowed) return false;
    this.player.setFacing(1);
    // Wait for the pose to be drawn before starting the page transition.
    const posed = await Promise.race([this.player.look(push), cancelled]);
    if (this.pagePush !== session || posed === false || this.destroyed || !this.controller.available || !this.controller.motionAllowed) {
      if (this.pagePush === session) this.finishPagePush();
      return false;
    }
    session.ready = true;
    this.motion.pagePushProgress(side, 0, session.viewport);
    return true;
  }

  setPagePushProgress(progress: number): void {
    if (!this.pagePush?.ready || !Number.isFinite(progress)) return;
    if (this.destroyed || !this.controller.available || !this.controller.motionAllowed) { this.finishPagePush(); return; }
    if (!this.pagePush.pushing) {
      this.pagePush.pushing = true;
      const clip = this.pagePush.side === 'left' ? 'push-right' : 'push-left';
      this.controller.physicalStage(clip);
      this.player.setFacing(1);
      this.player.play(clip, PAGE_PUSH_STEP_REPETITIONS);
    }
    this.motion.pagePushProgress(this.pagePush.side, progress, this.pagePush.viewport);
  }

  finishPagePush(recoverSupport = true): void {
    const session = this.pagePush;
    if (!session) return;
    this.pagePush = null;
    session.cancel();
    this.cancelMotion();
    this.motion.finishPagePush();
    this.player.stop(); this.player.setFacing(1);
    this.controller.finishAnimation();
    this.position();
    if (!recoverSupport) this.motion.cancel();
    if (!this.pageSuspended) this.controller.setInteractionHold(false);
    // Recover onto the current support after release, including a recent scroll.
    if (recoverSupport && this.ready && !this.destroyed && !this.pageSuspended && this.controller.available &&
        this.motion.needsRecovery && this.controller.beginPhysical(true)) {
      this.motionResult = this.motion.recover({ reducedMotion: !this.controller.motionAllowed });
    }
  }

  async perform(scene: AssistantScene): Promise<void> {
    if (!this.ready || this.destroyed || this.pageSuspended || this.config.behavior !== 'lively' || !this.controller.available ||
        !this.controller.motionAllowed || !['stroll', 'climb', 'peek', 'wiggle', 'flip', 'arrival', ...QUIET_GESTURES].includes(scene)) return;
    this.finishPagePush();
    if (!this.controller.interactionOnHold) this.paletteLook = null;
    if (QUIET_GESTURES.includes(scene as QuietScene)) {
      const appearing = this.entering;
      this.cancelMotion();
      if (appearing) this.motion.spawn();
      await this.controller.performQuiet(scene as QuietScene);
      return;
    }
    if (scene === 'arrival') this.startArrival(true); else this.controller.perform(scene as MotionKind);
    await this.motionResult;
  }

  async hide(): Promise<void> {
    if (this.destroyed) return;
    this.finishPagePush();
    this.setInteractionHold(false);
    this.preferences.update({ hidden: true });
    await this.closeInternal(false);
    this.track('hidden');
  }

  async restore(): Promise<void> {
    if (this.destroyed || !this.controller.allowed) return;
    this.preferences.update({ hidden: false });
    this.track('restored');
    await this.open();
  }

  destroy(): Promise<void> {
    if (this.destruction) return this.destruction;
    let resolveDestruction!: () => void;
    let rejectDestruction!: (reason: unknown) => void;
    // Store the complete cleanup before any callback can request destruction again.
    this.destruction = new Promise<void>((resolve, reject) => {
      resolveDestruction = resolve;
      rejectDestruction = reject;
    });
    this.destroyed = true;
    this.ready = false;
    this.openingGeneration++;
    void this.performDestroy().then(resolveDestruction, rejectDestruction);
    return this.destruction;
  }

  private async performDestroy(): Promise<void> {
    this.finishPagePush();
    this.abort.abort();
    if (this.pointerFrame) cancelAnimationFrame(this.pointerFrame);
    this.pointerFrame = 0;
    try { this.unsubscribe(); } catch { /* Store callbacks are isolated. */ }
    this.controller.destroy();
    this.viewport.destroy();
    this.motion.destroy();
    this.player.destroy();
    try {
      await this.closeInternal(false);
      if (this.opening) await this.opening;
    } finally {
      this.preferences.destroy();
      this.pageStyles.remove();
      this.view.destroy();
    }
  }

  private async performOpen(preserveScreen = false): Promise<void> {
    const generation = ++this.openingGeneration;
    if (this.closing) await this.closing;
    if (generation !== this.openingGeneration || this.destroyed || !this.controller.available) return;
    const screen = this.controller.snapshot.screen;
    this.caller = this.view.shadow.activeElement instanceof HTMLElement ? this.view.shadow.activeElement :
      document.activeElement instanceof HTMLElement ? document.activeElement : this.view.launcher;
    if (this.compact) {
      const session = await this.adapter.enterOverlay(() => {
        if (generation !== this.openingGeneration || this.destroyed) return;
        this.overlay = null;
        void this.closeInternal(true, true);
      });
      if (generation !== this.openingGeneration || this.destroyed || !this.controller.available) { await session.close(); return; }
      this.overlay = session;
      this.lockScroll();
    }
    if (!this.controller.open()) { await this.closeInternal(false); return; }
    if (preserveScreen) this.controller.screen(screen);
    this.view.show();
    this.track('opened');
  }

  private closeInternal(returnFocus: boolean, historyHandled = false, layoutChange = false): Promise<void> {
    this.openingGeneration++;
    if (!layoutChange) this.closeRequestGeneration++;
    if (this.closing) return this.closing;
    this.view.close();
    this.unlockScroll();
    this.controller.close();
    const overlay = this.overlay;
    this.overlay = null;
    this.closing = (async () => {
      if (overlay && !historyHandled) { try { await overlay.close(); } catch { /* Do not retain modal resources on router failure. */ } }
      if (returnFocus && !this.destroyed && this.controller.available) {
        const target = this.caller?.isConnected ? this.caller : this.view.launcher;
        if (!target.closest('[inert]')) target.focus({ preventScroll: true });
      }
    })().finally(() => { this.closing = null; });
    return this.closing;
  }

  private async changeLayout(): Promise<void> {
    if (this.compactQuery.matches === this.compact || this.destroyed) return;
    const opened = this.view.dialog.open;
    const screen = this.controller.snapshot.screen;
    const closeRequestGeneration = this.closeRequestGeneration;
    await this.closeInternal(false, false, true);
    if (this.destroyed) return;
    const compact = this.compactQuery.matches;
    this.compact = compact;
    this.view.setCompact(compact);
    this.controller.setEnvironment(compact, this.reducedQuery.matches);
    this.player.resize(compact ? 64 : 96);
    this.controller.block('field-focus', compact && document.activeElement instanceof HTMLElement &&
      (document.activeElement.matches('input,textarea') || document.activeElement.isContentEditable) &&
      (this.config.behavior !== 'lively' || this.controller.snapshot.context?.pageType !== 'checkout'));
    this.position();
    if (opened && closeRequestGeneration === this.closeRequestGeneration && this.controller.available) {
      await this.open();
      if (this.destroyed || closeRequestGeneration !== this.closeRequestGeneration || !this.view.dialog.open) return;
      this.controller.screen(screen);
      this.view.focusFirst();
    }
  }

  private position(): void {
    if (!this.ready || this.destroyed || this.pageSuspended) return;
    const viewport = visibleViewport();
    const size = this.compact ? 64 : 96;
    const previous = this.lastGeometry;
    if (this.pagePush) {
      const sameWindow = this.pagePush.windowWidth === window.innerWidth &&
        this.pagePush.windowHeight === window.innerHeight && this.pagePush.viewportScale === (window.visualViewport?.scale ?? 1);
      if (!sameWindow) { this.finishPagePush(); return; }
      if (previous && (previous.size !== size || previous.viewport.left !== viewport.left ||
          previous.viewport.top !== viewport.top || previous.viewport.width !== viewport.width || previous.viewport.height !== viewport.height)) {
        // Update support before approach; preserve contact during covered commits.
        const widthOnly = previous.size === size && previous.viewport.left === viewport.left &&
          previous.viewport.top === viewport.top && previous.viewport.height === viewport.height;
        if (!widthOnly) { this.finishPagePush(); return; }
        if (this.pagePush.ready) return;
      }
    }
    // Push from the browser floor; apply the new page's support after release.
    const reserved = this.pagePush?.reserved ?? this.controller.snapshot.context?.ui.bottomReservedPx ?? 0;
    const placement = this.view.position(reserved, this.config.position);
    // Track browser bars separately from changes to store panels.
    const followGround = this.config.behavior === 'lively' && !!previous &&
      previous.reserved === reserved && previous.size === size &&
      previous.viewport.width === viewport.width && previous.viewport.left === viewport.left;
    this.motion.updateBase(placement, placement.motionViewport,
      size, this.config.position, { followGround });
    this.lastGeometry = { viewport, reserved, size };
    this.updateSpeechPosition();
    const hadBlocker = this.controller.blockers.has('no-space');
    if (hadBlocker === placement.room) this.controller.block('no-space', !placement.room);
    if (this.shown) this.recoverPosition();
  }

  private render(): void {
    if (!this.ready || this.destroyed || this.pageSuspended) return;
    this.view.render(this.controller.snapshot, this.preferences.get(), this.reducedQuery.matches);
    if (this.pagePush && (!this.controller.available || !this.controller.motionAllowed)) this.finishPagePush();
    if (!this.controller.available) this.cancelMotion(true);
    if (this.arrivalPending) this.view.launcher.hidden = true;
    this.updateSpeechPosition();
    if (this.controller.snapshot.state !== 'open' && this.view.dialog.open) void this.closeInternal(false);
    if (!this.shown && this.controller.available && !this.arrivalPending) { this.shown = true; this.track('shown'); }
  }

  private resumeAfterScroll(): void {
    if (!this.ready || this.destroyed || !this.controller.available || this.controller.isScrolling || this.dragGesture || this.motion.moving) return;
    if (this.arrivalPending) {
      this.startArrival();
      return;
    }
    if (this.controller.snapshot.animation !== 'static') return;
    this.player.setFacing(1);
    this.player.stop();
    this.recoverPosition();
  }

  private resumeSuspendedPage(): void {
    if (!this.pageSuspended || !this.pageRestorePending || document.hidden || this.destroyed) return;
    // Unblock before rendering resumes; visibility and pageshow may arrive in either order.
    this.controller.block('page-suspended', false);
    this.controller.setInteractionHold(true);
    this.pageSuspended = false;
    this.pageRestorePending = false;
    this.position();
    this.controller.setInteractionHold(false);
    this.recoverPosition();
  }

  private recoverPosition(): void {
    if (!this.ready || this.destroyed || this.pageSuspended || this.config.behavior !== 'lively' || !this.controller.available ||
        this.controller.isScrolling || this.controller.interactionOnHold || this.dragGesture || this.motion.moving || !this.motion.needsRecovery ||
        this.controller.snapshot.animation !== 'static') return;
    if (!this.controller.beginPhysical()) return;
    this.motionResult = this.motion.recover({ reducedMotion: !this.controller.motionAllowed });
  }

  private updateSpeechPosition(offset: Readonly<{ x: number; y: number }> = this.motion.offset): void {
    const visible = this.view.setMotionOffset(offset);
    this.controller.holdGreeting(this.greetingHeld || visible === false);
  }

  private cancelMotion(reset = false, preserveCapture = false): void {
    if (this.pagePush) this.finishPagePush();
    this.replacingMotion = true;
    if (!preserveCapture) this.clearDragCapture();
    this.motion?.cancel(reset);
    this.replacingMotion = false;
    this.entering = false;
    this.arrivalPending = false;
    this.view.dataset.motion = '';
    this.view.launcher.dataset.motion = '';
    this.motionActivity = null;
    this.motionWalkUntil = 0;
    this.controller?.endPhysical(false);
  }

  private startArrival(userInitiated = false): void {
    this.cancelMotion();
    if (!this.controller.beginPhysical(userInitiated)) return;
    this.entering = true;
    this.motionResult = this.motion.enter(this.variation.arrival());
  }

  private motionStage(phase: MotionPhase, metadata?: MotionMetadata): void {
    if (this.destroyed) return;
    const samePhase = phase !== null && this.view.dataset.motion === phase;
    const activity = metadata?.activity ?? (samePhase ? this.motionActivity : null);
    const continuing = samePhase && this.motionActivity === activity;
    this.view.dataset.motion = phase ?? '';
    this.view.launcher.dataset.motion = phase ?? '';
    this.motionActivity = activity;
    if (metadata?.activity === 'walk' && metadata.durationMs) this.motionWalkUntil = performance.now() + metadata.durationMs;
    else if (activity !== 'walk') this.motionWalkUntil = 0;
    if (metadata?.arrival) this.view.dataset.entry = metadata.arrival;
    if (metadata?.facing) this.player.setFacing(metadata.facing);
    if (continuing) return;
    if (!phase) {
      if (this.replacingMotion) return;
      if (this.pagePush) {
        this.player.pause();
        this.controller.physicalStage('static');
        this.view.dataset.motion = 'page-push';
        this.view.launcher.dataset.motion = 'page-push';
        return;
      }
      const appeared = this.entering;
      this.entering = false;
      this.player.stop();
      this.player.setFacing(1);
      this.controller.endPhysical();
      if (this.paletteLook) this.lookAt(this.paletteLook);
      if (appeared && !this.compact && this.variation.chance(.4)) this.controller.physicalSpeech('welcome', 3500);
      return;
    }
    if (activity === 'curl' || activity === 'roll' || activity === 'uncurl') {
      this.player.pause();
      this.player.setFacing(1);
      const clip = this.pageApproachClip(activity);
      this.controller.physicalStage(clip);
      this.drawPageApproach({ activity, progress: metadata?.progress ?? 0 });
      return;
    }
    if (metadata?.activity === 'head-look') {
      this.controller.physicalStage('static');
      this.controller.dismissSpeech();
      this.player.play('head-peek', 1);
      return;
    }
    if (metadata?.activity === 'grip') {
      this.controller.physicalStage('climb');
      this.player.pause();
      return;
    }
    if (metadata?.activity === 'hide' || metadata?.activity === 'look') {
      this.player.stop();
      this.controller.physicalStage('static');
      if (metadata.activity === 'look') { this.player.setFacing(1); this.player.look('curious'); }
      else this.controller.dismissSpeech();
      return;
    }
    const clip = PHASE_CLIPS[phase];
    if (clip !== 'walk' && clip !== 'climb') this.player.setFacing(1);
    this.controller.physicalStage(clip);
    if (metadata?.activity === 'walk') this.continueWalking();
    else {
      const repetitions = clip === 'climb' && metadata?.durationMs
        ? Math.max(1, Math.min(8, Math.ceil(metadata.durationMs / 750)))
        : clip === 'walk' || clip === 'climb' ? 6 : 1;
      if (clip === 'held' || clip === 'fall' || clip === 'parachute' || clip === 'land') this.player.play(clip, repetitions, 140);
      else this.player.play(clip, repetitions);
    }
    if (phase === 'land' && !this.entering) this.controller.physicalSpeech('land');
  }

  private continueWalking(): void {
    const remaining = Math.max(1, this.motionWalkUntil - performance.now());
    this.player.play('walk', Math.max(1, Math.min(8, Math.ceil(remaining / 600))));
  }

  private pageApproachClip(activity: 'curl' | 'roll' | 'uncurl'): MotionClipName {
    if (activity === 'uncurl') return this.pagePush?.side === 'left' ? 'unroll-right' : 'unroll-left';
    return activity;
  }

  private drawPageApproach(metadata: MotionMetadata): void {
    const activity = metadata.activity;
    if (!this.pagePush || metadata.progress === undefined ||
        (activity !== 'curl' && activity !== 'roll' && activity !== 'uncurl')) return;
    this.player.sample(this.pageApproachClip(activity), metadata.progress, activity === 'roll');
  }

  private setupDragging(options: { signal: AbortSignal }): void {
    const launcher = this.view.launcher;
    launcher.classList.add('can-drag');
    launcher.setAttribute('aria-label', 'Погладить или перетащить Мохлика');
    // Chromium can start dragging an image beneath the original press point
    // after the launcher moves away. Keep the captured pointer gesture in charge.
    document.addEventListener('dragstart', (event) => {
      if (this.dragGesture) event.preventDefault();
    }, { ...options, capture: true });
    launcher.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.isPrimary === false || this.dragGesture || !this.ready || !this.controller.available) return;
      this.suppressClickUntil = 0;
      this.dragGesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY,
        lastX: event.clientX, lastY: event.clientY, moved: false };
      launcher.dataset.pressed = 'true';
      try { launcher.setPointerCapture(event.pointerId); } catch { /* Lost pointers are also handled by cancellation. */ }
      // Keep the current clip playing, but defer new automatic actions until
      // this press ends. The palette owns a separate, independent hold.
      this.controller.setPointerHold(true);
      // A ground press leaves the current scene running. An airborne catch is
      // already a lift, even before the pointer crosses the movement threshold.
      if (this.motion.airborne) this.startDragging();
    }, options);
    launcher.addEventListener('pointermove', (event) => {
      const gesture = this.dragGesture;
      if (!gesture || gesture.id !== event.pointerId) return;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
      if (!gesture.moved) {
        // On the ground, only crossing the movement threshold lifts him.
        if (!this.motion.dragging && !this.startDragging()) return;
        gesture.moved = true; this.view.dataset.dragging = 'true';
        this.controller.physicalSpeech('drag');
      }
      event.preventDefault();
      const offset = this.motion.offset;
      this.motion.dragTo({ x: offset.x + event.clientX - gesture.lastX, y: offset.y + event.clientY - gesture.lastY });
      gesture.lastX = event.clientX; gesture.lastY = event.clientY;
    }, options);
    launcher.addEventListener('pointerup', (event) => {
      if (this.dragGesture?.id !== event.pointerId) return;
      if (this.dragGesture.moved) event.preventDefault();
      this.finishDrag();
    }, options);
    launcher.addEventListener('pointercancel', (event) => {
      if (this.dragGesture?.id === event.pointerId) this.finishDrag(true);
    }, options);
    launcher.addEventListener('lostpointercapture', (event) => {
      if (this.dragGesture?.id === event.pointerId) this.finishDrag(true);
    }, options);
    launcher.addEventListener('click', (event) => {
      if (event.detail > 0 && performance.now() < this.suppressClickUntil) {
        this.suppressClickUntil = 0; event.preventDefault(); event.stopImmediatePropagation();
      }
    }, { ...options, capture: true });
  }

  private startDragging(): boolean {
    this.cancelMotion(false, true);
    this.player.pause();
    if (!this.controller.beginPhysical(true)) { this.clearDragCapture(); return false; }
    if (!this.motion.beginDrag()) {
      this.clearDragCapture(); this.controller.endPhysical(); return false;
    }
    return true;
  }

  private finishDrag(cancelled = false): void {
    const gesture = this.dragGesture;
    if (!gesture) return;
    // A stationary catch in mid-air still needs a landing after release.
    const needsRelease = gesture.moved || this.motion.dragging;
    this.clearDragCapture();
    if (cancelled) this.suppressClickUntil = performance.now() + 600;
    if (cancelled && needsRelease) {
      this.motionResult = this.motion.release({ reducedMotion: true });
      this.player.stop();
      return;
    }
    if (!needsRelease) return;
    this.suppressClickUntil = performance.now() + 600;
    this.motionResult = this.motion.release({ parachute: true,
      reducedMotion: !this.controller.motionAllowed });
  }

  private clearDragCapture(): void {
    const gesture = this.dragGesture;
    this.dragGesture = null;
    this.view.dataset.dragging = 'false';
    this.view.launcher.dataset.pressed = 'false';
    if (gesture) {
      try { this.view.launcher.releasePointerCapture(gesture.id); } catch { /* Capture may have been released by the browser. */ }
    }
    this.controller?.setPointerHold(false);
  }

  private async navigate(href: string, actionId: string, cart = false): Promise<void> {
    if (this.navigating || this.destroyed) return;
    this.navigating = true;
    try {
      this.track('action', actionId);
      await this.closeInternal(false);
      if (this.destroyed) return;
      try { if (cart) await this.adapter.openCart(); else await this.adapter.navigate(href); }
      catch { if (!this.destroyed) window.location.assign(href); }
    } finally { this.navigating = false; }
  }

  private lockScroll(): void {
    if (!document.documentElement.classList.contains('anime-assistant-scroll-locked')) {
      document.documentElement.classList.add('anime-assistant-scroll-locked');
      this.ownsScrollLock = true;
    }
  }
  private unlockScroll(): void {
    if (this.ownsScrollLock) document.documentElement.classList.remove('anime-assistant-scroll-locked');
    this.ownsScrollLock = false;
  }
  private track(name: AssistantAnalyticsEvent['name'], actionId?: string): void {
    if (!this.config.analyticsEnabled || !this.controller.snapshot.context?.permissions.analytics) return;
    try { this.adapter.track?.({ name, widgetVersion: '1.0.0', layout: this.compact ? 'compact' : 'desktop', ...(actionId ? { actionId } : {}) }); }
    catch { /* Analytics cannot affect the interface. */ }
  }
}

export function validInitialContext(value: unknown): value is ShopContext { return validateShopContext(value); }
