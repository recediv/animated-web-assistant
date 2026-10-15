import type { ArrivalKind, MotionKind } from '../positioning/personality';

export const REPLIES = {
  welcome: [
    'Тропинка привела меня сюда. Привет!',
    'Я Мохлик. Посмотрим, какие тут истории?',
    'Пахнет новым приключением.',
    'Устроюсь рядом. Меня можно поднять.',
    'Кажется, здесь начинается сказка.',
    'Тихонько приземлюсь и осмотрюсь.',
  ],
  pet: [
    'Как приятно! Рад тебя видеть.',
    'Привет! Ты меня позвал?',
    'Листочки щекотно шуршат. Спасибо.',
    'Ещё одно поглаживание — и я зацвету.',
    'Я рядом. Просто немного прячусь во мху.',
    'Можешь меня поднять. Отсюда лучше видно.',
    'Сейчас покажу маленький лесной фокус.',
    'С тобой даже тихий день становится сказкой.',
  ],
  wake: [
    'Не спал. Слушал, как растут деревья.',
    'Уже утро? Пора на тропинку.',
    'Секунду, расправлю листочки.',
    'Мне снился лес с летающими мостами.',
    'Я отдыхал под воображаемым папоротником.',
  ],
  interest: [
    'Новая история? Устроюсь рядом.',
    'Этого героя я ещё не встречал.',
    'Интересно, куда ведёт его тропинка?',
    'Давай рассмотрим вместе.',
    'Кажется, нам нравится одна сказка.',
    'Можно поближе? Я очень любопытный.',
    'У этой книги настроение приключения.',
    'Вот бы заглянуть в этот мир.',
  ],
  success: [
    'Ещё одна история в твоей коллекции!',
    'Готово. Отмечу это маленьким танцем!',
    'Книга в корзине. Листочки радуются.',
    'Отличный выбор для новой сказки.',
    'Есть! Коллекция растёт, как маленький лес.',
    'Теперь у приключения появился новый герой.',
    'Готово. Побуду твоим лесным талисманом.',
  ],
  error: [
    'Не получилось… Давай попробуем ещё раз?',
    'Не добавилось. Побуду рядом, пока пробуешь снова.',
    'Не добавилось. Маленькая заминка на тропинке.',
    'Попытка не прошла. Давай найдём другой путь.',
    'Кажется, нужна ещё одна попытка.',
    'Не вышло. Я подожду вместе с тобой.',
  ],
  peek: [
    'А вот и я! Выглянул из-за листика.',
    'Ты меня не видел. Почти.',
    'Можно тихонько выглянуть?',
    'Проверил край. Там начинается тайная тропинка.',
    'Я здесь. Только наполовину.',
  ],
  drag: [
    'Вот это высокая ветка!',
    'Поехали! Только листочки не помни.',
    'А лестницу из корней нельзя было?',
    'Отсюда виден целый сказочный лес.',
    'Это прогулка по воздуху?',
    'Держи крепче. Я выбираю место для посадки.',
  ],
  land: [
    'Уф. Все лапки на месте.',
    'Приземлился мягче сухого листика.',
    'Теперь устроюсь здесь.',
    'Посадка удалась. Ни листочка не потерял.',
    'Я почти не испугался.',
    'Хорошее место для маленького привала.',
  ],
  tail: [
    'Хвост решил поздороваться.',
    'Вот мой лесной танец.',
    'Листочки шуршат в такт.',
    'Репетировал под папоротником.',
    'Один танец — и снова на тропинку.',
  ],
  flip: [
    'Смотри на лапки!',
    'Маленький фокус с лесной тропинки.',
    'Получилось! Даже листочки на месте.',
    'Главное — мягко приземлиться.',
    'В лесу я так перепрыгиваю корешки.',
  ],
} as const;
export type ReplyKind = keyof typeof REPLIES;

const SCENES: readonly MotionKind[] = ['wiggle', 'flip', 'peek', 'stroll'];
const ENTRANCES: readonly ArrivalKind[] = ['left', 'right', 'bottom', 'top'];
export const PERSONALITY_SESSION_KEY = 'animeShopAssistant:v1:personality';
interface DeckState { remaining: string[]; last: string | null }
interface SessionState { schema: 1; decks: Record<string, DeckState> }

/** Shuffled decks prevent an immediate repeat, including across a full page reload. */
export class PersonalityVariation {
  private decks = new Map<string, DeckState>();
  private permission: boolean;
  private storage: Storage | null;
  private random: () => number;

  constructor(options: { permission?: boolean; storage?: Storage | null; random?: () => number } = {}) {
    this.permission = options.permission ?? false;
    this.random = options.random ?? Math.random;
    try { this.storage = options.storage === undefined ? window.sessionStorage : options.storage; }
    catch { this.storage = null; }
    if (this.permission) {
      try {
        const stored: unknown = JSON.parse(this.storage?.getItem(PERSONALITY_SESSION_KEY) ?? 'null');
        if (typeof stored === 'object' && stored !== null && 'schema' in stored && stored.schema === 1 &&
            'decks' in stored && typeof stored.decks === 'object' && stored.decks !== null) {
          for (const [key, value] of Object.entries(stored.decks)) {
            if (typeof value === 'object' && value !== null && Array.isArray(value.remaining) &&
                value.remaining.every((item: unknown) => typeof item === 'string') &&
                (value.last === null || typeof value.last === 'string')) this.decks.set(key, value);
          }
        }
      } catch { /* Session variety also works in memory when storage is unavailable. */ }
    }
  }

  setPermission(permission: boolean): void {
    if (permission === this.permission) return;
    this.permission = permission;
    if (permission) this.save();
    else { try { this.storage?.removeItem(PERSONALITY_SESSION_KEY); } catch { /* Own record only. */ } }
  }

  chance(probability: number): boolean { return this.unit() < probability; }
  between(minimum: number, maximum: number): number { return Math.round(minimum + this.unit() * (maximum - minimum)); }
  scene(): MotionKind { return this.pick('scene', SCENES); }
  arrival(): ArrivalKind { return this.pick('arrival', ENTRANCES); }
  reply(kind: ReplyKind): string { return this.pick(`reply:${kind}`, REPLIES[kind]); }

  private unit(): number { const value = this.random(); return Number.isFinite(value) ? Math.max(0, Math.min(.999999, value)) : .5; }

  private pick<T extends string>(key: string, values: readonly T[]): T {
    let deck = this.decks.get(key);
    if (!deck || deck.remaining.length > values.length || new Set(deck.remaining).size !== deck.remaining.length ||
        !deck.remaining.every((item) => values.includes(item as T)) || (deck.last !== null && !values.includes(deck.last as T))) {
      deck = { remaining: [], last: null };
    }
    if (!deck.remaining.length) {
      deck.remaining = [...values];
      for (let index = deck.remaining.length - 1; index > 0; index--) {
        const other = Math.floor(this.unit() * (index + 1));
        [deck.remaining[index], deck.remaining[other]] = [deck.remaining[other]!, deck.remaining[index]!];
      }
      if (deck.remaining.length > 1 && deck.remaining[0] === deck.last) {
        [deck.remaining[0], deck.remaining[1]] = [deck.remaining[1]!, deck.remaining[0]!];
      }
    }
    const selected = deck.remaining.shift()! as T;
    deck.last = selected;
    this.decks.set(key, deck);
    this.save();
    return selected;
  }

  private save(): void {
    if (!this.permission || !this.storage) return;
    try {
      const state: SessionState = { schema: 1, decks: Object.fromEntries(this.decks) };
      this.storage.setItem(PERSONALITY_SESSION_KEY, JSON.stringify(state));
    } catch { /* Failed session storage cannot disable the companion. */ }
  }
}
