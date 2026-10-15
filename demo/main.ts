import { createDemoAdapter } from '../src/adapters/demo';
import type { AssistantInstance, PageType, ShopEvent } from '../src/config/types';
import { artUrl, categories, formatPrice, products, type Product } from './products';
import { mountAnimatedSky } from './storybook-sky';
import { routePath, siteUrl } from './site-paths';
import './styles.css';
import './typography.css';
import './storybook.css';
import './hero-books.css';
import './book-page.css';
import './readability.css';
import './hero-layout.css';
import './link-layout.css';
import './page-layout.css';
import './cart-companion.css';
import './page-push-transition.css';

const icons = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.2 4.2"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>',
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15M12 5l7 7-7 7"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M9 21v-8h6v8"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></svg>',
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
const app = document.querySelector<HTMLDivElement>('#app')!;
const demoAbort = new window.AbortController();
const demoListenerOptions = { signal: demoAbort.signal };
let demoDestroyed = false;
let demoSuspended = false;
let demoDestruction: Promise<void> | undefined;
let bottomPanelObserver: ResizeObserver | undefined;
const cart = new Map<string, number>();
const blockers = new Set<string>();
const mobileMedia = window.matchMedia('(max-width: 760px)');
const pageMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
interface PageEntry {
  overlay: HTMLElement;
  viewport: {
    windowWidth: number;
    windowHeight: number;
    height: number;
    left: number;
    top: number;
    scale: number;
  };
  animations: Set<Animation>;
  commit: () => void;
  committed: boolean;
  previousInert: string | null;
  focusTarget: HTMLElement | null;
  resolve: () => void;
  raf: number | null;
  finishCompanion: () => void;
}
interface PageOrigin {
  x: number;
  y: number;
}
let pageEntry: PageEntry | undefined;
let cardEntry: { animations: Set<Animation>; reset: () => void } | undefined;
let pageSequence = 0;
let assistant: AssistantInstance | undefined;
let assistantInitPromise: Promise<AssistantInstance> | undefined;
let assistantModulePromise: Promise<typeof import('../src/index')> | undefined;
let companionSkills:
  | ReturnType<typeof import('./companion-skills')['mountCompanionSkills']>
  | undefined;
let cancelAssistantStartup: (() => void) | undefined;
let restoringAssistant = false;
type DemoScene = Parameters<NonNullable<AssistantInstance['perform']>>[0];
let nextFailure = false;
let lastAddedEvent: ShopEvent | undefined;
let pageCounter = 0;
let renderedRoute = '';
let sortOrder = 'featured';
let messageTimer: ReturnType<typeof setTimeout> | undefined;
let brokenConfigUrl: string | undefined;
let storageFailure = false;
const originalStorageGet = Storage.prototype.getItem;
const originalStorageSet = Storage.prototype.setItem;
const originalStorageRemove = Storage.prototype.removeItem;
const adapter = createDemoAdapter({
  // Config routes already include the deployment prefix.
  navigate: (href) => navigate(new URL(href, location.href).href),
  openCart: () => openDialog('cart'),
});

const companionScenes = [
  {
    name: 'summon',
    title: 'Позвать Мохлика',
    description: 'Вернётся, если спрятался. А погладить его можно прямо на экране.',
    glyph: '✦',
  },
  {
    name: 'arrival',
    title: 'Неожиданное появление',
    description: 'Придёт сбоку, спустится сверху или взберётся снизу.',
    glyph: '↘',
  },
  {
    name: 'stroll',
    title: 'Маленькая прогулка',
    description: 'Пройдётся вдоль нижнего края и останется на новом месте.',
    glyph: '→',
  },
  {
    name: 'climb',
    title: 'Покарабкаться',
    description: 'Подойдёт к краю, зацепится лапками и подтянется повыше.',
    glyph: '↑',
  },
  {
    name: 'peek',
    title: 'Выглянуть из-за края',
    description: 'Спрячется за экраном и выглянет головой или целиком.',
    glyph: '◐',
  },
  {
    name: 'wiggle',
    title: 'Озорной хвост',
    description: 'Повернётся спинкой, повиляет хвостом и подмигнёт.',
    glyph: 'ϟ',
  },
  {
    name: 'grab',
    title: 'Подними и отпусти',
    description: 'Возьми самого Мохлика мышкой или пальцем. Приземлится на новом месте.',
    glyph: '↟',
  },
  {
    name: 'sit',
    title: 'Сделать привал',
    description: 'Устроится поудобнее, вытянет лапки и покажет подушечки.',
    glyph: '⌣',
  },
  {
    name: 'ears',
    title: 'Поиграть ушками',
    description: 'Согнёт одно ушко, потом другое, а затем оба сразу.',
    glyph: '❧',
  },
  {
    name: 'scratch',
    title: 'Почесать щёчку',
    description: 'Наклонит голову к левой лапке и неловко почешет щёку.',
    glyph: '≈',
  },
  {
    name: 'stretch',
    title: 'Милая зарядка',
    description: 'Поднимет короткую лапку и потянется в противоположную сторону.',
    glyph: '↔',
  },
  {
    name: 'nose',
    title: 'Пошевелить носиком',
    description: 'Принюхается и подёргает носиком туда-сюда.',
    glyph: '⋄',
  },
  {
    name: 'interest',
    title: 'Заинтересовать',
    description: 'Заметит товар и отреагирует, когда отдыхает между сценками.',
    glyph: '?',
  },
  {
    name: 'guitar',
    title: 'Лесной рок',
    description: 'Достанет электрогитару, сыграет рифф и повернётся спинкой, виляя хвостиком.',
    glyph: '♫',
  },
] as const;

app.innerHTML = `
  <a class="skip-link" href="#main">К содержимому</a>
  <div class="announcement"><span>У КАЖДОЙ КНИГИ ЕСТЬ СВОЁ ВОЛШЕБСТВО</span><a class="announcement-note" href="${siteUrl('/catalog')}"><span class="link-label">Лавка добрых сказок</span><span class="link-arrow" aria-hidden="true">↗</span></a></div>
  <header class="site-header">
    <a class="brand" href="${siteUrl('/')}" aria-label="ЛУМОЛИ — главная">ЛУМОЛИ<span class="brand-dot">✳</span></a>
    <nav class="desktop-nav" aria-label="Главная навигация"><a href="${siteUrl('/catalog')}">Каталог</a><a href="${siteUrl('/new')}">Новинки <span class="nav-dot"></span></a><a href="${siteUrl('/delivery')}">Доставка и оплата</a><a href="${siteUrl('/contacts')}">Контакты</a></nav>
    <div class="header-actions"><button class="icon-button" data-dialog="search" aria-label="Поиск сказок">${icons.search}</button><button class="icon-button cart-trigger" data-dialog="cart" aria-label="Открыть корзину">${icons.bag}<span class="cart-badge" data-cart-count>0</span></button><button class="icon-button mobile-menu-button" data-dialog="menu" aria-label="Открыть меню">${icons.menu}</button></div>
  </header>
  <main id="main" tabindex="-1"></main>
  <footer class="site-footer">
    <div class="footer-top"><div><a class="brand footer-brand" href="${siteUrl('/')}">ЛУМОЛИ<span class="brand-dot">✳</span></a><p>Для тех, кто хранит целые миры на книжной полке.</p></div><div class="footer-links"><a href="${siteUrl('/catalog')}">Каталог</a><a href="${siteUrl('/new')}">Новинки</a><a href="${siteUrl('/delivery')}">Доставка и оплата</a><a href="${siteUrl('/contacts')}">Контакты</a><button data-restore class="footer-assistant">Позвать Мохлика <span aria-hidden="true">ϟ</span></button><button data-dialog="cookie">Настройки cookie</button></div><div class="footer-letter"><span>СОБИРАЙ ТО, ЧТО ЛЮБИШЬ.</span><span class="footer-spark" aria-hidden="true">✳</span></div></div>
    <div class="footer-bottom"><span>© 2026 ЛУМОЛИ · лавка сказок</span><span>Истории для маленьких мечтателей и больших детей.</span></div>
    <details class="demo-lab" lang="en">
      <summary>Diagnostics <span aria-hidden="true">+</span></summary>
      <output class="demo-status" id="demo-status" aria-live="polite">Initializing companion…</output>
      <details class="technical-scenarios">
        <summary>Shop checks <span aria-hidden="true">+</span></summary>
        <p>Test cart events, dialogs and settings.</p>
        <div class="scenario-actions">
          <button data-scenario="success">Add item</button>
          <button data-scenario="error">Fail cart update</button>
          <button data-scenario="duplicate">Repeat event</button>
          <button data-scenario="rapid">Add 5 items</button>
          <button data-scenario="unknown">Unknown cart count</button>
          <button data-dialog="search">Search</button>
          <button data-dialog="menu">Shop menu</button>
          <button data-dialog="cart">Cart</button>
          <button data-dialog="cookie">Cookies</button>
          <button data-scenario="blockers">Add 2 blockers</button>
          <button data-scenario="unblock-one">Remove 1 blocker</button>
          <button data-scenario="unblock-all">Remove all blockers</button>
          <button data-scenario="sticky">Toggle sticky buy panel</button>
          <button data-scenario="storage">Fail storage</button>
          <button data-scenario="graphics">Fail artwork loading</button>
          <button data-scenario="reinit">Repeat init</button>
          <button data-scenario="reset">Reset diagnostics</button>
          <a href="${siteUrl('/checkout')}">Checkout</a>
          <a href="${siteUrl('/payment')}">Payment</a>
          <a href="${siteUrl('/account')}">Account</a>
        </div>
      </details>
    </details>
  </footer>
  <nav class="mobile-bottom-nav" aria-label="Мобильная навигация"><a href="${siteUrl('/')}">${icons.home}<span>Главная</span></a><a href="${siteUrl('/catalog')}">${icons.grid}<span>Каталог</span></a><button data-dialog="search">${icons.search}<span>Поиск</span></button><button data-dialog="cart">${icons.bag}<span>Корзина <span data-cart-count>0</span></span></button></nav>
  <div class="sticky-buy" hidden><div class="sticky-buy-inner"><span><strong id="sticky-product-name">${products[0]!.name}</strong><span id="sticky-product-price">${formatPrice(products[0]!.price)}</span></span><button class="button button-dark" data-add="electric-sun"><span data-add-label>В корзину</span> ${icons.bag}</button></div></div>
  <div class="shop-toast" role="status" aria-live="polite"></div>
  <dialog class="shop-dialog search-dialog" id="search-dialog" aria-labelledby="search-heading"><div class="dialog-heading"><div><span class="eyebrow">НАЙДИ СВОЙ МИР</span><h2 id="search-heading">Что ищем?</h2></div><button class="icon-button" data-close="search" aria-label="Закрыть поиск">${icons.close}</button></div><form id="search-form" role="search"><label for="shop-search">Название книги или сказочный мир</label><div class="search-field">${icons.search}<input id="shop-search" type="search" autocomplete="off" placeholder="Например, Листолесье" /></div></form><div class="search-results" id="search-results"></div></dialog>
  <dialog class="shop-dialog cart-companion-surface" id="cart-dialog" aria-labelledby="cart-heading"><section class="cart-dialog cart-companion-panel"><div class="dialog-heading"><div><span class="eyebrow">ТВОИ СКАЗКИ</span><h2 id="cart-heading">Корзина <span data-cart-count>0</span></h2></div><button class="icon-button" data-close="cart" aria-label="Закрыть корзину">${icons.close}</button></div><div id="cart-dialog-content"></div><div class="cart-companion-pocket" aria-hidden="true"></div></section></dialog>
  <dialog class="shop-dialog menu-dialog" id="menu-dialog" aria-labelledby="menu-heading"><div class="dialog-heading"><h2 id="menu-heading">Твой следующий мир</h2><button class="icon-button" data-close="menu" aria-label="Закрыть меню">${icons.close}</button></div><nav aria-label="Меню магазина"><a href="${siteUrl('/catalog')}">Каталог ${icons.arrow}</a><a href="${siteUrl('/new')}">Новинки ${icons.arrow}</a><a href="${siteUrl('/delivery')}">Доставка и оплата ${icons.arrow}</a><a href="${siteUrl('/contacts')}">Контакты ${icons.arrow}</a><a href="${siteUrl('/cart')}">Корзина ${icons.arrow}</a></nav><span class="menu-note">ЛУМОЛИ · лавка добрых сказок</span></dialog>
  <dialog class="shop-dialog cookie-dialog" id="cookie-dialog" aria-labelledby="cookie-heading"><div class="dialog-heading"><span class="cookie-symbol" aria-hidden="true">✳</span><button class="icon-button" data-close="cookie" aria-label="Закрыть настройки cookie">${icons.close}</button></div><h2 id="cookie-heading">Маленькие файлы. Твои правила.</h2><p>Мохлик может запомнить твой выбор анимации и своё любимое место, если ты разрешишь.</p><label class="cookie-toggle"><span>Сохранять настройки помощника</span><input id="persistent-permission" type="checkbox" checked /></label><button class="button button-dark" data-cookie-save>Сохранить выбор ${icons.arrow}</button></dialog>
`;

const animatedSky = mountAnimatedSky();

async function initializeCompanionSkills(): Promise<void> {
  if (demoDestroyed || !document.querySelector('anime-shop-assistant')) return;
  const { mountCompanionSkills } = await import('./companion-skills');
  if (demoDestroyed || !document.querySelector('anime-shop-assistant')) return;
  companionSkills ??= mountCompanionSkills({
    getHost: () => document.querySelector<HTMLElement>('anime-shop-assistant'),
    getBottomReservedPx: () => adapter.getContext().ui.bottomReservedPx,
    setInteractionHold: (hold) => assistant?.setInteractionHold?.(hold),
    isInteractionBlocked: () => demoDestroyed || Boolean(pageEntry) || !assistant,
    lookAt: (point) => assistant?.lookAt?.(point),
    scenes: companionScenes.filter((scene) =>
      ['wiggle', 'sit', 'ears', 'scratch', 'stretch', 'nose', 'guitar'].includes(scene.name),
    ),
    runScene: async (name) => {
      if (name === 'grab') showMessage('Подними самого Мохлика мышкой или пальцем и отпусти.');
      await runScenario(name);
    },
  });
}

function cartActionLabel(id: string): string {
  return cart.has(id) ? 'В корзине' : 'В корзину';
}

function productCard(product: Product): string {
  const label = cartActionLabel(product.id);
  return `<article class="product-card book-card"><a class="product-art-link" href="${siteUrl(`/product/${product.id}`)}" aria-label="${product.name} — открыть книгу" style="--card-color:${product.color}"><span class="product-tag">${product.tag}</span><span class="product-index">${product.age}</span><span class="book-volume"><img class="product-art" src="${artUrl(product.art)}" alt="Обложка книги «${product.name}»" loading="lazy" width="440" height="600"/></span></a><div class="product-info"><div><span class="product-series">${product.series} <span>· ${product.pages} страниц</span></span><h3><a href="${siteUrl(`/product/${product.id}`)}">${product.name}</a></h3><span class="book-author">${product.author}</span><span class="product-price">${formatPrice(product.price)}</span></div><button class="product-add" data-add="${product.id}" aria-label="${label} — «${product.name}»" title="${label}">${icons.bag}</button></div></article>`;
}

function categoryBar(selected: string): string {
  return `<div class="catalog-controls"><nav class="category-filters" aria-label="Сказочные миры">${categories.map((category) => `<a class="filter-chip ${selected === category.id ? 'active' : ''}" href="${siteUrl(`/catalog${category.id === 'all' ? '' : `?category=${category.id}`}`)}" ${selected === category.id ? 'aria-current="page"' : ''}><span aria-hidden="true">${category.glyph}</span>${category.label}</a>`).join('')}</nav>${sortPicker()}</div>`;
}

function sortPicker(): string {
  const choices = [
    { value: 'featured', label: 'Наш выбор' },
    { value: 'price-asc', label: 'Сначала дешевле' },
    { value: 'price-desc', label: 'Сначала дороже' },
  ];
  const current = choices.find((choice) => choice.value === sortOrder) ?? choices[0]!;
  return `<div class="sort-label"><span>Сортировка</span><details class="sort-picker"><summary class="sort-picker-trigger" aria-label="Сортировка: ${current.label}"><svg class="sort-picker-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h10M3 15h6"/></svg><span>${current.label}</span><svg class="sort-picker-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></summary><div class="sort-picker-options" role="group" aria-label="Варианты сортировки">${choices.map((choice) => `<button type="button" data-sort="${choice.value}" aria-pressed="${choice.value === sortOrder}"><span>${choice.label}</span><span class="sort-picker-check" aria-hidden="true">✓</span></button>`).join('')}</div><select id="sort-order" aria-label="Порядок товаров" hidden tabindex="-1">${choices.map((choice) => `<option value="${choice.value}" ${choice.value === sortOrder ? 'selected' : ''}>${choice.label}</option>`).join('')}</select></details></div>`;
}

function hero(): string {
  const front = products.find((product) => product.id === 'electric-sun')!;
  const back = products.find((product) => product.id === 'moon-guardian')!;
  const side = products.find((product) => product.id === 'crimson-fox')!;
  return `<section class="hero"><div class="hero-copy"><span class="eyebrow"><span class="small-spark" aria-hidden="true">✳</span> ЛУМОЛИ · ЛАВКА ДОБРЫХ СКАЗОК</span><h1><span>Открой свою </span><span>сказку</span></h1><p>Истории, в которых лес умеет шептать, а маленькие герои творят большие чудеса.</p><div class="hero-actions"><a class="button button-dark" href="${siteUrl('/catalog')}">Найти свою книгу ${icons.arrow}</a><a class="text-link" href="${siteUrl('/new')}"><span class="link-label">Новая глава</span><span class="link-arrow" aria-hidden="true">↗</span></a></div><span class="hero-demo-note">Для чтения под одеялом и путешествий во сне</span></div><div class="hero-visual" aria-label="Книги из сказочных миров Лумоли"><div class="hero-orbit" aria-hidden="true"></div><span class="hero-edition">ГЛАВА 01 / ОСЕНЬ ’26</span><div class="hero-card hero-card-back"><img src="${artUrl(back.art)}" alt="${back.name}" width="440" height="600"/></div><div class="hero-card hero-card-side"><img src="${artUrl(side.art)}" alt="${side.name}" width="440" height="600"/></div><div class="hero-card hero-card-front"><img src="${artUrl(front.art)}" alt="${front.name}" width="440" height="600"/><span class="hero-card-seal">ЛУМОЛИ</span></div><div class="hero-sticker"><span>ОТКРОЙ</span><span class="sticker-spark" aria-hidden="true">✳</span><span>СВОЮ СКАЗКУ</span></div><span class="hero-tiny-star star-one" aria-hidden="true">✦</span><span class="hero-tiny-star star-two" aria-hidden="true">✧</span></div></section><div class="collection-strip"><span>ЗНАКОМЬСЯ С ГЕРОЯМИ</span><span aria-hidden="true">✳</span><span>ЧИТАЙ СКАЗКИ</span><span aria-hidden="true">✳</span><span>ИССЛЕДУЙ МИРЫ</span><span aria-hidden="true">✳</span><span>НАЧИНАЙ ПРИКЛЮЧЕНИЕ</span></div>`;
}

function collectionSection(home: boolean, fresh = false): string {
  const selected = new URLSearchParams(location.search).get('category') ?? 'all';
  let filtered = products.filter(
    (product) =>
      (selected === 'all' || product.category === selected) &&
      (!fresh || product.tag === 'Новинка'),
  );
  if (sortOrder === 'price-asc') filtered = filtered.sort((a, b) => a.price - b.price);
  if (sortOrder === 'price-desc') filtered = filtered.sort((a, b) => b.price - a.price);
  return `<section class="collection-section${fresh ? ' fresh-collection' : ''}" id="collection"><div class="section-heading"><div><span class="eyebrow">${fresh ? 'СВЕЖИЕ ИСТОРИИ' : 'ВЫБИРАЙ СЕРДЦЕМ'}</span><${home ? 'h2' : 'h1'}>${fresh ? 'Свежие сказки на нашей полке.' : home ? 'Найди свою следующую историю.' : 'Книжная полка чудес.'}</${home ? 'h2' : 'h1'}></div></div>${categoryBar(selected)}<div class="product-grid">${filtered.length ? filtered.map(productCard).join('') : `<div class="empty-state"><h2>Здесь пока тихо.</h2><p>На этой полке пока тихо. Загляни в другие сказочные миры.</p><a class="button button-dark" href="${siteUrl('/catalog')}">Весь каталог</a></div>`}</div>${home ? `<a class="all-catalog-link" href="${siteUrl('/catalog')}"><span class="link-label">Заглянуть на все полки</span><span class="link-arrow" aria-hidden="true">↗</span></a>` : ''}</section>`;
}

function helperBanner(): string {
  return `<section class="helper-banner"><div class="helper-banner-spark" aria-hidden="true">ϟ</div><div><span class="eyebrow">МОХЛИК РЯДОМ</span><h2>Хранитель тропинок и твоего настроения.</h2><p>Можно погладить, поднять и отпустить. А новую сказку он встретит с любопытством.</p><button class="button button-dark" data-restore>Позвать Мохлика ${icons.arrow}</button></div><div class="companion-orbit" aria-hidden="true"><span>ϟ</span><i>✦</i><b>✧</b></div><span class="banner-note">Наведи на Мохлика — выбери приключение.</span></section>`;
}

function productPage(product: Product): string {
  const openings: Record<string, string> = {
    'electric-sun': 'В то утро лес проснулся раньше солнца. Эллиан выглянул из окна и увидел, как тропинка осторожно перебирается с одного холма на другой. В кармане тихонько звякнул янтарный фонарь: кажется, он уже знал, где потерялся рассвет.',
    'moon-guardian': 'Письмо лежало на подоконнике, хотя окно было закрыто. На конверте серебрилась всего одна строка: «Тому, кто умеет слушать ночь». Найра присела рядом, и лунный мост за окном сделал первый шаг к её дому.',
    'crimson-fox': 'Рэйна искала пропавшую варежку, а нашла смешинку. Она сидела под столом, светилась рыжим огоньком и никак не хотела возвращаться в лисью маску. «Только не рассказывай мельнице», — прошептала смешинка. Тут-то Рэйна и поняла: приключение уже началось.',
    'sky-dragon': 'Аэрви считал облака и дошёл до девяти с половиной. Половинка облака зацепилась за верхушку башни и попросила помочь. Маленький дракон расправил крылья: высоко он пока не летал, зато прекрасно умел придумывать обходные пути.',
    'forest-spirit': 'Мохлик собирался на самую обычную прогулку. Но у знакомого пенька выросла крохотная тропинка, а на ней лежала записка величиной с листочек: «Чудо немного стесняется. Приходи тихо». Мохлик улыбнулся и поправил свой дорожный узелок.',
    'star-witch': 'В атласе Лиоры появилась пустая страница. Она пахла морозным небом, а в самом уголке кто-то нарисовал маленький вопросительный знак. Девочка открыла окно: над крышей ждала звезда, которая никак не могла вспомнить своё имя.',
  };
  const opening = openings[product.id] ?? 'На первой странице начиналась тропинка. Стоило перевернуть лист, и вдали загорелось маленькое окно: новая история уже ждала своего читателя.';
  return `<section class="product-page book-product-page">
    <nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="${siteUrl('/')}">Главная</a><span>/</span><a href="${siteUrl('/catalog')}">Книжная полка</a><span>/</span><span>${product.name}</span></nav>
    <div class="product-detail">
      <div class="product-detail-art book-stage" style="--card-color:${product.color}">
        <span class="product-tag">${product.tag}</span>
        <span class="book-stage-spark book-stage-spark-first" aria-hidden="true">✦</span><span class="book-stage-spark book-stage-spark-second" aria-hidden="true">✧</span>
        <span class="book-volume"><img src="${artUrl(product.art)}" alt="Обложка книги «${product.name}»" width="440" height="600"/></span>
        <span class="detail-art-note">${product.series} · волшебство на каждой странице</span>
      </div>
      <div class="product-detail-copy">
        <span class="eyebrow">${product.series.toUpperCase()} / ${product.age}</span>
        <h1>${product.name}</h1><span class="detail-author">${product.author}</span><p>${product.description}</p>
        <div class="product-details-list"><div><span>Страниц</span><strong>${product.pages}</strong></div><div><span>Переплёт</span><strong>${product.format}</strong></div><div><span>Для мечтателей</span><strong>${product.age}</strong></div></div>
        <div class="book-purchase"><div><span class="book-price-label">На твою книжную полку</span><span class="detail-price">${formatPrice(product.price)}</span></div><button class="button button-dark detail-add" data-add="${product.id}"><span data-add-label>${cartActionLabel(product.id)}</span> ${icons.bag}</button></div>
        <details class="book-preview"><summary><span class="book-preview-mark" aria-hidden="true">✦</span>Заглянуть в сказку<span class="book-preview-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></summary><div class="book-preview-body"><span class="book-preview-note">Начало истории</span><p>${opening}</p></div></details>
        <a class="text-link" href="${siteUrl('/delivery')}"><span class="link-label">Как придёт моя книга?</span><span class="link-arrow" aria-hidden="true">↗</span></a>
      </div>
    </div>
  </section><section class="related-section"><div class="section-heading"><div><span class="eyebrow">ЕЩЁ ОДНА ИСТОРИЯ</span><h2>В хорошей компании.</h2></div><a class="text-link" href="${siteUrl('/catalog')}"><span class="link-label">Весь каталог</span><span class="link-arrow" aria-hidden="true">↗</span></a></div><div class="product-grid">${products
    .filter((item) => item.id !== product.id)
    .slice(0, 3)
    .map(productCard)
    .join('')}</div></section>`;
}

function cartItems(): string {
  if (!cart.size)
    return `<div class="empty-state"><span class="empty-spark" aria-hidden="true">✳</span><h3>Твой мир начинается с одной книги.</h3><p>В корзине пока пусто. Давай найдём ту самую?</p><a class="button button-dark" href="${siteUrl('/catalog')}">К сказкам ${icons.arrow}</a></div>`;
  return `<div class="cart-items">${[...cart.entries()]
    .map(([id, quantity]) => {
      const product = products.find((item) => item.id === id)!;
      return `<article class="cart-item"><a href="${siteUrl(`/product/${id}`)}"><img src="${artUrl(product.art)}" alt="${product.name}" width="76" height="96" /></a><div><span class="product-series">${product.series}</span><h3><a href="${siteUrl(`/product/${id}`)}">${product.name}</a></h3><span>${formatPrice(product.price)}</span><div class="quantity-control"><button data-quantity="${id}" data-delta="-1" aria-label="Уменьшить количество «${product.name}»">−</button><span aria-label="Количество">${quantity}</span><button data-quantity="${id}" data-delta="1" aria-label="Увеличить количество «${product.name}»">+</button></div></div><button class="icon-button remove-item" data-remove="${id}" aria-label="Удалить «${product.name}» из корзины">${icons.close}</button></article>`;
    })
    .join(
      '',
    )}</div><div class="cart-summary"><div><span>Итого</span><strong>${formatPrice(cartTotal())}</strong></div><p>Ещё одна история для твоей книжной полки.</p><a class="button button-dark" href="${siteUrl('/checkout')}">Перейти к оформлению ${icons.arrow}</a><a class="text-link" href="${siteUrl('/catalog')}"><span class="link-label">Выбрать ещё сказку</span><span class="link-arrow" aria-hidden="true">↗</span></a></div>`;
}

function cartPage(): string {
  return `<section class="simple-page cart-page"><span class="eyebrow">ТВОЯ КНИЖНАЯ ПОЛКА</span><h1>Корзина</h1><p class="page-intro">Каждая большая история начинается с любимой книги.</p><div class="cart-page-content">${cartItems()}</div></section>`;
}

function formatBookCount(count: number): string {
  const form = new Intl.PluralRules('ru-RU').select(count);
  const noun = form === 'one' ? 'книга' : form === 'few' ? 'книги' : 'книг';
  return `${count} ${noun}`;
}

function checkoutSummary(): string {
  return `<span class="eyebrow">ТВОИ СКАЗКИ</span><h2>${formatBookCount(cartCount())}</h2>${[
    ...cart.entries(),
  ]
    .map(([id, quantity]) => {
      const product = products.find((item) => item.id === id)!;
      return `<div class="summary-line"><span>${product.name} × ${quantity}</span><strong>${formatPrice(product.price * quantity)}</strong></div>`;
    })
    .join(
      '',
    )}<div class="summary-total"><span>Итого</span><strong>${formatPrice(cartTotal())}</strong></div><span class="checkout-spark" aria-hidden="true">✳</span>`;
}

function checkoutPage(): string {
  return `<section class="simple-page"><a class="text-link" href="${siteUrl('/cart')}"><span class="link-arrow" aria-hidden="true">←</span><span class="link-label">Вернуться к корзине</span></a><span class="eyebrow page-eyebrow">ПОЧТИ У ТВОЕЙ КНИЖНОЙ ПОЛКИ</span><h1>Оформление</h1><div class="checkout-layout"><form id="checkout-form" class="checkout-form"><h2>Твои данные</h2><label>Имя<input name="name" autocomplete="off" placeholder="Например, Саша" required /></label><label>Email<input name="email" type="email" autocomplete="off" placeholder="hello@example.com" required /></label><h2>Как придёт твоя сказка</h2><fieldset><legend>Выбери способ</legend><label class="radio-label"><input type="radio" name="delivery" value="pickup" checked /> Пункт выдачи <span>Самовывоз</span></label><label class="radio-label"><input type="radio" name="delivery" value="courier" /> Курьерская доставка <span>До двери</span></label></fieldset><label>Город<input name="city" autocomplete="off" placeholder="Твой город" required /></label><button class="button button-dark" type="submit">Продолжить ${icons.arrow}</button></form><aside class="checkout-summary">${checkoutSummary()}</aside></div></section>`;
}

function informationPage(kind: string): string {
  if (kind === 'delivery')
    return `<section class="simple-page"><span class="eyebrow">ПУТЬ К ТВОЕЙ КНИЖНОЙ ПОЛКЕ</span><h1>Как приходят сказки</h1><p class="page-intro">У каждой истории есть дорога. Выбери, как начнётся твоя.</p><div class="information-grid"><article><span class="info-number">01</span><h2>Выбери свою книгу</h2><p>Загляни в сказочные миры, познакомься с героями и положи любимые истории в корзину.</p></article><article><span class="info-number">02</span><h2>Укажи удобный путь</h2><p>Пункт выдачи по дороге домой или курьерская доставка к двери — книги любят путешествовать.</p></article><article><span class="info-number">03</span><h2>Открой первую страницу</h2><p>Устройся поудобнее, возьми чашку чего-нибудь тёплого и приготовься встретить чудо.</p></article></div><a class="button button-dark" href="${siteUrl('/catalog')}">К сказкам ${icons.arrow}</a></section>`;
  if (kind === 'contacts')
    return `<section class="simple-page contact-page"><span class="eyebrow">ПИСЬМА В ЛАВКУ СКАЗОК</span><h1>Есть история? Расскажи</h1><div class="contact-layout"><div><p class="page-intro">У хороших сказок всегда есть продолжение. Нам интересно твоё.</p><div class="contact-note"><span class="contact-spark" aria-hidden="true">✳</span><h2>Мохлик слушает.</h2><p>Расскажи о любимой книге или о мире, который хочется открыть.</p><button class="text-link" data-restore><span class="link-label">Позвать Мохлика</span><span class="link-arrow" aria-hidden="true">↗</span></button></div></div><form id="contact-form" class="checkout-form"><label>Как тебя зовут?<input name="name" required placeholder="Твоё имя" autocomplete="off" /></label><label>Email<input type="email" name="email" required placeholder="hello@example.com" autocomplete="off" /></label><label>Твоя история<textarea name="message" rows="4" required placeholder="О чём хочется рассказать?" autocomplete="off"></textarea></label><button class="button button-dark" type="submit">Проверить письмо ${icons.arrow}</button></form></div></section>`;
  if (kind === 'payment')
    return `<section class="simple-page center-page"><span class="empty-spark" aria-hidden="true">✳</span><span class="eyebrow">У КАЖДОЙ СКАЗКИ ЕСТЬ ПРОДОЛЖЕНИЕ</span><h1>История ждёт</h1><p class="page-intro">Книги выбраны. Оплата пока недоступна. Заказ не создан, деньги не списаны.</p><a class="button button-dark" href="${siteUrl('/catalog')}">Ещё одна история ${icons.arrow}</a></section>`;
  if (kind === 'account')
    return `<section class="simple-page center-page"><span class="eyebrow">ТВОЙ УГОЛОК В ЛАВКЕ</span><h1>Моя книжная полка</h1><p class="page-intro">Личный кабинет скоро появится. А пока загляни в наши сказочные миры.</p><a class="button button-dark" href="${siteUrl('/catalog')}">Открыть каталог ${icons.arrow}</a></section>`;
  return `<section class="simple-page center-page"><span class="eyebrow">ЭТОТ МИР ЕЩЁ НЕ ОТКРЫТ</span><h1>Сказка потерялась</h1><p class="page-intro">Попробуем найти другую историю?</p><a class="button button-dark" href="${siteUrl('/catalog')}">В каталог ${icons.arrow}</a></section>`;
}

function currentPageType(): PageType {
  if (demoDestroyed) return 'other';
  const path = routePath(location.pathname) ?? '';
  if (path === '/') return 'home';
  if (path === '/catalog' || path === '/new') return 'catalog';
  if (path.startsWith('/product/')) return 'product';
  if (['cart', 'checkout', 'payment', 'account'].includes(path.slice(1)))
    return path.slice(1) as PageType;
  return 'other';
}

const assistantHostObserver = new window.MutationObserver(() => {
  if (!demoDestroyed && !demoSuspended) syncAssistantControls();
});

function syncAssistantControls(pageType = currentPageType()): void {
  if (demoDestroyed) return;
  const host = document.querySelector('anime-shop-assistant');
  const unavailable = !!assistant && !host;
  const hidden = unavailable || ['payment', 'account'].includes(pageType);
  app
    .querySelectorAll<HTMLElement>('[data-restore],[data-assistant-control]')
    .forEach((element) => {
      element.hidden = hidden;
    });
  assistantHostObserver.disconnect();
  if (demoSuspended) return;
  assistantHostObserver.observe(document.body, { childList: true });
  if (host?.parentNode && host.parentNode !== document.body)
    assistantHostObserver.observe(host.parentNode, { childList: true });
}

function cancelPageEntry(commitPending = false): void {
  const entry = pageEntry;
  pageEntry = undefined;
  if (!entry) return;
  if (entry.raf !== null) window.cancelAnimationFrame(entry.raf);
  entry.raf = null;
  for (const animation of entry.animations) {
    animation.onfinish = null;
    animation.oncancel = null;
    animation.cancel();
  }
  entry.animations.clear();
  entry.finishCompanion();
  entry.overlay.remove();
  if (entry.previousInert === null) app.removeAttribute('inert');
  else app.setAttribute('inert', entry.previousInert);
  try {
    if (commitPending && !entry.committed) entry.commit();
    else if (entry.focusTarget && !entry.focusTarget.closest('[inert]'))
      entry.focusTarget.focus({ preventScroll: true });
  } finally {
    entry.resolve();
  }
}

function cancelCardEntry(): void {
  const entry = cardEntry;
  cardEntry = undefined;
  if (!entry) return;
  for (const animation of entry.animations) {
    animation.onfinish = null;
    animation.oncancel = null;
    animation.cancel();
  }
  entry.animations.clear();
  entry.reset();
}

function cancelRouteMotion(commitPending = false): void {
  cancelPageEntry(commitPending);
  cancelCardEntry();
}

function animateCardEntry(main: HTMLElement): void {
  if (pageMotionMedia.matches || typeof main.animate !== 'function') return;
  const cards = [...main.querySelectorAll<HTMLElement>('.product-grid .product-card')].slice(0, 6);
  if (!cards.length) return;
  const animations = new Set<Animation>();
  const styles = new Map(
    cards.map((card) => [
      card,
      {
        opacity: card.style.opacity,
        transform: card.style.transform,
        willChange: card.style.willChange,
      },
    ]),
  );
  const resetCard = (card: HTMLElement): void => {
    const original = styles.get(card);
    if (!original) return;
    card.style.opacity = original.opacity;
    card.style.transform = original.transform;
    card.style.willChange = original.willChange;
    styles.delete(card);
  };
  const entry = { animations, reset: () => cards.forEach(resetCard) };
  cardEntry = entry;
  // Hide all new cards before scheduling their animations.
  cards.forEach((card) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';
    card.style.willChange = 'opacity, transform';
  });
  try {
    cards.forEach((card, index) => {
      const animation = card.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 480,
          delay: index * 24,
          easing: 'cubic-bezier(.3, 0, .25, 1)',
          fill: 'both',
        },
      );
      animations.add(animation);
      animation.onfinish = () => {
        if (cardEntry !== entry) return;
        animation.onfinish = null;
        animation.oncancel = null;
        animations.delete(animation);
        resetCard(card);
        animation.cancel();
        if (!animations.size) cardEntry = undefined;
      };
      animation.oncancel = () => {
        if (cardEntry === entry) cancelCardEntry();
      };
    });
  } catch {
    cancelCardEntry();
  }
}

function animatePageEntry(
  commit: () => void,
  sequence: number,
  origin?: PageOrigin,
): Promise<void> {
  if (pageMotionMedia.matches || typeof app.animate !== 'function') {
    commit();
    return Promise.resolve();
  }
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const scroll = window.scrollY;
  const layoutWidth = document.documentElement.clientWidth || window.innerWidth;
  const host = document.querySelector<HTMLElement>('anime-shop-assistant');
  const actor = host?.shadowRoot?.querySelector<HTMLElement>('.pika-a-launcher');
  const actorRect = actor?.getBoundingClientRect();
  const actorCenter = actorRect?.width ? actorRect.left + actorRect.width / 2 : origin?.x;
  const side: 'left' | 'right' =
    actorCenter !== undefined && actorCenter < left + width / 2 ? 'left' : 'right';
  const overlay = document.createElement('div');
  overlay.className = 'page-push';
  overlay.dataset.side = side;
  overlay.dataset.stage = 'prepare';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('inert', '');
  Object.assign(overlay.style, {
    position: 'fixed',
    zIndex: '95',
    overflow: 'hidden',
    pointerEvents: 'none',
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    height: height + 'px',
  });
  const panel = document.createElement('div');
  panel.className = 'page-push-panel';
  Object.assign(panel.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    backgroundColor: '#fcf7e9',
    transform: 'translateX(0)',
  });
  const world = document.createElement('div');
  world.className = 'page-push-world';
  Object.assign(world.style, {
    position: 'absolute',
    width: layoutWidth + 'px',
    minHeight: Math.max(document.documentElement.scrollHeight, scroll + top + height) + 'px',
    left: -left + 'px',
    top: -scroll - top + 'px',
    background: window.getComputedStyle(document.body).background,
    isolation: 'isolate',
  });
  const sky = document.querySelector<HTMLElement>('.storybook-sky');
  if (sky) {
    const skyCopy = sky.cloneNode(true) as HTMLElement;
    skyCopy.dataset.paused = 'true';
    skyCopy.style.zIndex = '0';
    const replacements = new Map<string, string>();
    for (const element of skyCopy.querySelectorAll('[id]')) {
      const id = element.id;
      const replacement = `page-push-${sequence}-${id}`;
      replacements.set(id, replacement);
      element.id = replacement;
    }
    for (const element of skyCopy.querySelectorAll('*')) {
      for (const attribute of [...element.attributes]) {
        let value = attribute.value;
        for (const [id, replacement] of replacements) {
          value = value.replaceAll(`url(#${id})`, `url(#${replacement})`);
          if (value === `#${id}`) value = `#${replacement}`;
        }
        if (value !== attribute.value) element.setAttribute(attribute.name, value);
      }
    }
    const animated = '.storybook-cloud,.storybook-lantern,.storybook-sunlight,.storybook-sun-core,.storybook-sunrays';
    const originalNodes = [...sky.querySelectorAll<SVGElement>(animated)];
    const copiedNodes = [...skyCopy.querySelectorAll<SVGElement>(animated)];
    originalNodes.forEach((node, index) => {
      const copy = copiedNodes[index];
      if (!copy) return;
      const style = window.getComputedStyle(node);
      copy.style.animation = 'none';
      copy.style.transform = style.transform;
      copy.style.opacity = style.opacity;
    });
    world.append(skyCopy);
  }
  const snapshot = app.cloneNode(true) as HTMLElement;
  snapshot.dataset.pagePushSnapshot = 'true';
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.setAttribute('inert', '');
  snapshot.style.width = layoutWidth + 'px';
  snapshot.style.position = 'relative';
  snapshot.style.zIndex = '1';
  snapshot.querySelectorAll('dialog,script,style,link,anime-shop-assistant,.shop-toast').forEach((node) => node.remove());
  snapshot.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  snapshot.querySelectorAll('[autofocus]').forEach((node) => node.removeAttribute('autofocus'));
  snapshot.querySelectorAll<HTMLElement>('*').forEach((node) => {
    for (const attribute of [...node.attributes])
      if (attribute.name.startsWith('data-')) node.removeAttribute(attribute.name);
  });
  snapshot.querySelectorAll<HTMLElement>('a,button,input,select,textarea,[tabindex]').forEach((node) => {
    node.setAttribute('tabindex', '-1');
  });
  snapshot.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.loading = 'eager';
  });
  for (const selector of ['.mobile-bottom-nav', '.sticky-buy']) {
    const original = app.querySelector<HTMLElement>(selector);
    const copy = snapshot.querySelector<HTMLElement>(selector);
    if (!original || !copy || original.hidden) continue;
    const rect = original.getBoundingClientRect();
    Object.assign(copy.style, {
      position: 'absolute',
      left: rect.left + 'px',
      top: rect.top + scroll + 'px',
      right: 'auto',
      bottom: 'auto',
      width: rect.width + 'px',
      height: rect.height + 'px',
      margin: '0',
    });
  }
  const originalBooks = [...app.querySelectorAll<HTMLElement>('.hero-card')];
  snapshot.querySelectorAll<HTMLElement>('.hero-card').forEach((copy, index) => {
    const original = originalBooks[index];
    if (!original) return;
    const style = window.getComputedStyle(original);
    copy.style.animation = 'none';
    copy.style.transform = style.transform;
    copy.style.translate = style.translate;
    copy.style.rotate = style.rotate;
    copy.style.marginTop = style.marginTop;
    copy.style.transition = 'none';
  });
  world.append(snapshot);
  panel.append(world);
  overlay.append(panel);
  const companion = assistant;
  let companionStarted = false;
  let companionFinished = false;
  return new Promise<void>((resolve) => {
    const entry: PageEntry = {
      overlay,
      viewport: {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        height, left, top, scale: viewport?.scale ?? 1,
      },
      animations: new Set(),
      commit,
      committed: false,
      previousInert: app.getAttribute('inert'),
      focusTarget: null,
      resolve,
      raf: null,
      finishCompanion: () => {
        if (!companionStarted || companionFinished) return;
        companionFinished = true;
        companion?.finishPagePush?.();
      },
    };
    pageEntry = entry;
    // Block live controls while the old page covers them.
    app.setAttribute('inert', '');
    document.body.append(overlay);
    const slide = async (): Promise<void> => {
      let prepared = false;
      if (companion?.preparePagePush && companion.setPagePushProgress && companion.finishPagePush) {
        companionStarted = true;
        try {
          prepared = await companion.preparePagePush(side);
        } catch {
          prepared = false;
        }
      }
      if (pageEntry !== entry || sequence !== pageSequence) return;
      overlay.dataset.stage = 'slide';
      overlay.dataset.companion = String(prepared);
      // Commit beneath the opaque snapshot.
      entry.committed = true;
      commit();
      if (pageEntry !== entry || sequence !== pageSequence) return;
      const duration = prepared ? 3000 : 900;
      const distance = side === 'left' ? width : -width;
      const stops = [0, .5, 1];
      const segments = stops.length - 1;
      const effortEasing = 'cubic-bezier(.6,0,.35,1)';
      const keyframes = prepared
        ? stops.map((progress, index) => ({
            offset: index / segments,
            transform: `translateX(${distance * progress}px)`,
            easing: effortEasing,
          }))
        : [{ transform: 'translateX(0)' }, { transform: `translateX(${distance}px)` }];
      const animation = panel.animate(
        keyframes,
        { duration, easing: prepared ? 'linear' : 'cubic-bezier(.42,0,.58,1)', fill: 'both' },
      );
      entry.animations.add(animation);
      animation.onfinish = () => {
        if (pageEntry !== entry || sequence !== pageSequence) return;
        if (prepared) companion?.setPagePushProgress?.(1);
        cancelPageEntry();
      };
      animation.oncancel = () => {
        if (pageEntry === entry) cancelPageEntry(true);
      };
      if (!prepared) return;
      // Advance both in one frame to keep the paws against the page edge.
      animation.pause();
      animation.currentTime = 0;
      const startTime = window.performance.now();
      const ease = (value: number): number => {
        let low = 0;
        let high = 1;
        for (let iteration = 0; iteration < 14; iteration += 1) {
          const t = (low + high) / 2;
          const x = 3 * (1 - t) ** 2 * t * .6 + 3 * (1 - t) * t ** 2 * .35 + t ** 3;
          if (x < value) low = t;
          else high = t;
        }
        const t = (low + high) / 2;
        return 3 * (1 - t) * t ** 2 + t ** 3;
      };
      const follow = (timestamp: number): void => {
        entry.raf = null;
        if (pageEntry !== entry || sequence !== pageSequence) return;
        const elapsed = Math.max(0, timestamp - startTime);
        animation.currentTime = Math.min(duration, elapsed);
        const raw = Math.max(0, Math.min(1, elapsed / duration));
        if (raw === 1) { animation.finish(); return; }
        const timing = animation.effect?.getComputedTiming().progress;
        const timeProgress = typeof timing === 'number' ? timing : raw;
        const segment = Math.min(segments - 1, Math.floor(timeProgress * segments));
        const start = stops[segment]!;
        const end = stops[segment + 1]!;
        const progress = start + (end - start) * ease(timeProgress * segments - segment);
        companion?.setPagePushProgress?.(progress);
        if (animation.playState !== 'idle')
          entry.raf = window.requestAnimationFrame(follow);
      };
      companion?.setPagePushProgress?.(0);
      entry.raf = window.requestAnimationFrame(follow);
    };
    void slide().catch(() => {
      if (pageEntry === entry) cancelPageEntry(true);
    });
  });
}

function renderPage(
  routeChanged = true,
  origin?: PageOrigin,
  cardsChanged = false,
  resetScroll = false,
): Promise<void> {
  if (demoDestroyed) return Promise.resolve();
  const path = routePath(location.pathname) ?? '';
  const nextRoute = `${path}${location.search}`;
  const previousPath = renderedRoute.split('?')[0]!;
  const animateEntry = routeChanged && !!renderedRoute && path !== previousPath;
  if (animateEntry) companionSkills?.close();
  const queryChanged = !!renderedRoute && path === previousPath && nextRoute !== renderedRoute;
  const animateCards =
    !animateEntry && (queryChanged || cardsChanged) && ['/', '/catalog', '/new'].includes(path);
  cancelRouteMotion();
  const sequence = ++pageSequence;
  const commit = () => {
    if (sequence !== pageSequence) return;
    const main = document.querySelector<HTMLElement>('#main')!;
    renderedRoute = nextRoute;
    if (path === '/') main.innerHTML = `${hero()}${collectionSection(true)}${helperBanner()}`;
    else if (path === '/catalog' || path === '/new')
      main.innerHTML = `${collectionSection(false, path === '/new')}${helperBanner()}`;
    else if (path.startsWith('/product/')) {
      const product = products.find((item) => item.id === path.split('/')[2]);
      main.innerHTML = product ? productPage(product) : informationPage('404');
    } else if (path === '/cart') main.innerHTML = cartPage();
    else if (path === '/checkout') main.innerHTML = checkoutPage();
    else main.innerHTML = informationPage(path.slice(1));
    const pageType = currentPageType();
    syncAssistantControls(pageType);
    app
      .querySelectorAll<HTMLAnchorElement>('.desktop-nav a,.mobile-bottom-nav a')
      .forEach((link) => {
        if (routePath(link.pathname) === path) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    const sticky = document.querySelector<HTMLElement>('.sticky-buy')!;
    sticky.hidden =
      pageType !== 'product' || !products.some((item) => item.id === path.split('/')[2]);
    if (pageType === 'product') {
      const product = products.find((item) => item.id === path.split('/')[2]);
      if (product) {
        document.querySelector('#sticky-product-name')!.textContent = product.name;
        document.querySelector('#sticky-product-price')!.textContent =
          `${formatPrice(product.price)}`;
        sticky.querySelector<HTMLButtonElement>('[data-add]')!.dataset.add = product.id;
      }
    }
    publishUi(
      routeChanged
        ? {
            pageType,
            pageKey: `${location.pathname}${location.search}#${++pageCounter}`,
          }
        : undefined,
    );
    updateCartUi();
    if (routeChanged && pageType === 'product' && assistant) emitInteraction('product:enter');
    document.title = `ЛУМОЛИ — ${pageType === 'home' ? 'лавка добрых сказок' : pageType === 'catalog' ? 'книги из сказочных миров' : pageType === 'product' ? (products.find((item) => item.id === path.split('/')[2])?.name ?? 'книга') : path === '/new' ? 'новинки' : pageType === 'cart' ? 'корзина' : pageType === 'checkout' ? 'оформление' : 'твой следующий мир'}`;
    if (resetScroll) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (pageEntry) pageEntry.focusTarget = main;
      else main.focus({ preventScroll: true });
    }
    if (animateCards) animateCardEntry(main);
  };
  if (animateEntry) return animatePageEntry(commit, sequence, origin);
  commit();
  return Promise.resolve();
}

async function navigate(href: string, origin?: PageOrigin): Promise<void> {
  if (demoDestroyed) return;
  const url = new URL(siteUrl(href), location.href);
  if (url.origin !== location.origin || routePath(url.pathname) === null) {
    location.assign(url.href);
    return;
  }
  closeAllDialogs();
  companionSkills?.close();
  await assistant?.close();
  if (demoDestroyed) return;
  if (`${url.pathname}${url.search}` === `${location.pathname}${location.search}`) return;
  history.pushState(
    { ...history.state, demoRoute: true },
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
  await renderPage(true, origin, false, true);
}

function cartCount(): number {
  return [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
}
function cartTotal(): number {
  return [...cart.entries()].reduce(
    (sum, [id, quantity]) => sum + products.find((item) => item.id === id)!.price * quantity,
    0,
  );
}
function updateCartContent(content: HTMLElement): void {
  const active = document.activeElement;
  const focused = active instanceof HTMLElement && content.contains(active) ? active : null;
  const item = focused?.closest('.cart-item');
  const itemIndex = item ? [...content.querySelectorAll('.cart-item')].indexOf(item) : -1;
  const controlIndex = item
    ? [...item.querySelectorAll('a[href],button')].indexOf(focused!)
    : -1;
  const productId = item?.querySelector<HTMLElement>('[data-remove]')?.dataset.remove;
  const href = focused?.getAttribute('href');

  content.innerHTML = cartItems();
  if (!focused) return;

  const items = [...content.querySelectorAll<HTMLElement>('.cart-item')];
  const nextItem =
    items.find(
      (entry) => entry.querySelector<HTMLElement>('[data-remove]')?.dataset.remove === productId,
    ) ??
    items[Math.min(itemIndex, items.length - 1)];
  const nextControl =
    nextItem?.querySelectorAll<HTMLElement>('a[href],button')[controlIndex] ??
    [...content.querySelectorAll<HTMLAnchorElement>('a[href]')].find(
      (link) => link.getAttribute('href') === href,
    ) ??
    content.querySelector<HTMLElement>('a[href],button');
  nextControl?.focus({ preventScroll: true });
}
function updateCartUi(): void {
  app.querySelectorAll('[data-cart-count]').forEach((element) => {
    element.textContent = String(cartCount());
  });
  app.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((button) => {
    const product = products.find((item) => item.id === button.dataset.add);
    if (!product) return;
    const label = cartActionLabel(product.id);
    button.setAttribute('aria-label', `${label} — «${product.name}»`);
    button.title = label;
    const text = button.querySelector('[data-add-label]');
    if (text) text.textContent = label;
  });
  updateCartContent(document.querySelector<HTMLElement>('#cart-dialog-content')!);
  const content = app.querySelector<HTMLElement>('.cart-page-content');
  if (content) updateCartContent(content);
  const summary = app.querySelector<HTMLElement>('.checkout-summary');
  if (summary) summary.innerHTML = checkoutSummary();
}

function showMessage(message: string, error = false): void {
  if (demoDestroyed) return;
  const toast = document.querySelector<HTMLElement>('.shop-toast')!;
  toast.textContent = message;
  toast.classList.toggle('is-error', error);
  toast.classList.add('visible');
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

function scenarioStatus(message: string): void {
  if (demoDestroyed) return;
  document.querySelector('#demo-status')!.textContent = message;
}

async function addProduct(
  id: string,
  options: { fail?: boolean; quantity?: number; delay?: number } = {},
): Promise<void> {
  if (demoDestroyed) return;
  const product = products.find((item) => item.id === id);
  if (!product) return;
  const failed = options.fail ?? nextFailure;
  nextFailure = false;
  const buttons = [...app.querySelectorAll<HTMLButtonElement>(`[data-add="${id}"]`)];
  buttons.forEach((button) => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  });
  await new Promise((resolve) => setTimeout(resolve, options.delay ?? 420));
  if (demoDestroyed) return;
  buttons.forEach((button) => {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  });
  if (failed) {
    emitInteraction('cart:error');
    showMessage('Не удалось положить книгу в корзину. Попробуй ещё раз.', true);
    scenarioStatus('Cart update failed. Cart unchanged; cart:added not emitted.');
    return;
  }
  const quantity = options.quantity ?? 1;
  const beforeCount = cartCount();
  cart.set(id, (cart.get(id) ?? 0) + quantity);
  if (adapter.getContext().cartCount !== beforeCount) adapter.update({ cartCount: beforeCount });
  const eventId = `demo-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  adapter.confirmCartAdd(eventId, quantity);
  lastAddedEvent = { type: 'cart:added', id: eventId, quantity, occurredAt: Date.now() };
  updateCartUi();
  showMessage(`«${product.name}» теперь в корзине.`);
  scenarioStatus(
    `Cart update confirmed. Count: ${cartCount()}. cart:added emitted.`,
  );
}

const dialogBlockers: Record<string, string> = {
  search: 'search',
  cart: 'cart-drawer',
  menu: 'mobile-menu',
  cookie: 'cookie-modal',
};
function bottomReservedHeight(): number {
  return [
    ...app.querySelectorAll<HTMLElement>('.mobile-bottom-nav,.sticky-buy'),
  ].reduce(
    (height, panel) => height + (panel.hidden ? 0 : panel.getBoundingClientRect().height),
    0,
  );
}
function publishUi(page?: { pageType: PageType; pageKey: string }): void {
  if (demoDestroyed) return;
  adapter.update({
    ...page,
    ui: {
      blockers: [...blockers],
      bottomReservedPx: bottomReservedHeight(),
      floatingAllowed: true,
    },
  });
  syncCartCompanion();
  document.documentElement.classList.toggle(
    'shop-dialog-open',
    [...document.querySelectorAll<HTMLDialogElement>('.shop-dialog')].some((dialog) => dialog.open),
  );
}

let cartCompanionMount: { host: HTMLElement; parent: Node; next: Node | null } | null = null;
const cartCompanionSurfaces = new WeakSet<HTMLDialogElement>();

function restoreCartCompanion(): void {
  const mounted = cartCompanionMount;
  cartCompanionMount = null;
  // Dialog cleanup must not restart a destroyed assistant.
  if (!mounted?.host.isConnected || !mounted.host.closest('#cart-dialog')) return;
  const parent = mounted.parent.isConnected ? mounted.parent : document.body;
  parent.insertBefore(mounted.host, mounted.next?.parentNode === parent ? mounted.next : null);
}

function syncCartCompanion(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#cart-dialog');
  if (!dialog?.open) return;
  dialog.style.setProperty(
    '--cart-companion-reserved',
    `${adapter.getContext().ui.bottomReservedPx}px`,
  );
  const host = document.querySelector<HTMLElement>('anime-shop-assistant');
  if (!host || dialog.contains(host)) return;
  restoreCartCompanion();
  if (!host.parentNode) return;
  cartCompanionMount = { host, parent: host.parentNode, next: host.nextSibling };
  // Move the existing host into the modal's top layer without resetting it.
  dialog.append(host);
}

function openDialog(kind: string): void {
  const dialog = document.querySelector<HTMLDialogElement>(`#${kind}-dialog`);
  if (!dialog || dialog.open) return;
  if (kind === 'cart') {
    updateCartUi();
    blockers.delete(dialogBlockers.cart!);
    if (!cartCompanionSurfaces.has(dialog)) {
      cartCompanionSurfaces.add(dialog);
      dialog.addEventListener('close', () => {
        if (!dialog.open) restoreCartCompanion();
      }, demoListenerOptions);
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDialog('cart');
      }, demoListenerOptions);
    }
    dialog.showModal();
    syncCartCompanion();
    publishUi();
    return;
  }
  if (kind === 'search') updateSearch('');
  blockers.add(dialogBlockers[kind]!);
  publishUi();
  dialog.showModal();
  publishUi();
  if (kind === 'search') dialog.querySelector<HTMLInputElement>('input')!.focus();
}

function closeDialog(kind: string): void {
  const dialog = document.querySelector<HTMLDialogElement>(`#${kind}-dialog`);
  if (kind === 'cart') {
    if (!dialog?.open && !cartCompanionMount && !blockers.has(dialogBlockers.cart!)) return;
    if (dialog?.open) dialog.close();
    restoreCartCompanion();
    blockers.delete(dialogBlockers.cart!);
    publishUi();
    return;
  }
  if (!dialog?.open && !blockers.has(dialogBlockers[kind]!)) return;
  if (dialog?.open) dialog.close();
  blockers.delete(dialogBlockers[kind]!);
  publishUi();
}
function closeAllDialogs(): void {
  Object.keys(dialogBlockers).forEach(closeDialog);
}

function updateSearch(query: string): void {
  const normalized = query.toLocaleLowerCase('ru-RU').trim();
  const found = products.filter((product) =>
    `${product.name} ${product.series}`.toLocaleLowerCase('ru-RU').includes(normalized),
  );
  document.querySelector('#search-results')!.innerHTML =
    `<span class="search-result-count">${query ? `Результаты для «${escapeHtml(query)}»` : 'НАЧНИ С ЛЮБИМОЙ ВСЕЛЕННОЙ'} · ${found.length}</span>${found.length ? found.map((product) => `<a class="search-result" href="${siteUrl(`/product/${product.id}`)}"><img src="${artUrl(product.art)}" alt="" width="52" height="66"/><span><strong>${product.name}</strong><small>${product.series} · ${formatPrice(product.price)}</small></span>${icons.arrow}</a>`).join('') : '<p class="search-empty">Такая история ещё не появилась. Попробуй другое название.</p>'}`;
}

function toggleStorageFailure(enabled: boolean): void {
  storageFailure = enabled;
  Storage.prototype.getItem = enabled
    ? function () {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      }
    : originalStorageGet;
  Storage.prototype.setItem = enabled
    ? function () {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      }
    : originalStorageSet;
  Storage.prototype.removeItem = enabled
    ? function () {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      }
    : originalStorageRemove;
}

async function reinitialize(brokenGraphics = false): Promise<void> {
  if (demoDestroyed) return;
  cancelAssistantStartup?.();
  companionSkills?.destroy();
  companionSkills = undefined;
  const previous = assistant ?? (await assistantInitPromise);
  await previous?.destroy();
  if (demoDestroyed) return;
  assistant = undefined;
  assistantInitPromise = undefined;
  let configUrl = siteUrl('/demo/assistant.config.json');
  if (brokenGraphics) {
    const config = (await fetch(configUrl, { signal: demoAbort.signal }).then((response) => response.json())) as {
      assets: { poster: string; atlas: string; manifest: string };
    };
    if (demoDestroyed) return;
    config.assets.poster = siteUrl('/assistant/1.0.0/missing-poster.webp');
    config.assets.atlas = siteUrl('/assistant/1.0.0/missing-atlas.webp');
    config.assets.manifest = siteUrl('/assistant/1.0.0/missing-atlas.json');
    if (brokenConfigUrl) URL.revokeObjectURL(brokenConfigUrl);
    brokenConfigUrl = URL.createObjectURL(
      new Blob([JSON.stringify(config)], { type: 'application/json' }),
    );
    configUrl = brokenConfigUrl;
  }
  await initializeAssistant(configUrl);
}

function initializeAssistant(
  configUrl = siteUrl('/demo/assistant.config.json'),
): Promise<AssistantInstance> {
  if (demoDestroyed) return Promise.reject(new Error('Demo has been destroyed'));
  cancelAssistantStartup?.();
  if (assistant) return Promise.resolve(assistant);
  if (assistantInitPromise) return assistantInitPromise;
  scenarioStatus('Initializing companion…');
  const pending = (async () => {
    assistantModulePromise ??= import('../src/index');
    const { init } = await assistantModulePromise;
    const instance = await init({ configUrl, adapter, signal: demoAbort.signal });
    if (demoDestroyed) { await instance.destroy(); return instance; }
    assistant = instance;
    syncAssistantControls();
    syncCartCompanion();
    await initializeCompanionSkills();
    if (demoDestroyed) { await instance.destroy(); return instance; }
    companionSkills?.refresh();
    scenarioStatus(
      document.querySelector('anime-shop-assistant')
        ? 'Companion ready. Pet or drag with a mouse or touch.'
        : 'Artwork unavailable. Companion disabled; shop remains usable.',
    );
    if (currentPageType() === 'product') emitInteraction('product:enter');
    return instance;
  })();
  assistantInitPromise = pending;
  void pending.catch(() => {
    if (assistantInitPromise === pending) assistantInitPromise = undefined;
    assistantModulePromise = undefined;
  });
  return pending;
}

function scheduleAssistantStartup(): void {
  if (demoDestroyed) return;
  let cancelled = false;
  let idle: number | undefined;
  let frame: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    cancelled = true;
    window.removeEventListener('load', loaded);
    document.removeEventListener('visibilitychange', visible);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (timer !== undefined) clearTimeout(timer);
    cancelAssistantStartup = undefined;
  };
  const start = () => {
    if (cancelled) return;
    if (document.visibilityState === 'hidden') {
      document.addEventListener('visibilitychange', visible);
      return;
    }
    void initializeAssistant().catch((error: unknown) => {
      console.warn('Companion unavailable:', error);
      scenarioStatus('Companion unavailable. Shop remains usable.');
    });
  };
  const scheduleIdle = () => {
    if (cancelled) return;
    if (document.visibilityState === 'hidden') {
      document.addEventListener('visibilitychange', visible);
      return;
    }
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(
        () => {
          idle = undefined;
          start();
        },
        { timeout: 1200 },
      );
    } else {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = undefined;
          timer = setTimeout(start, 0);
        });
      });
    }
  };
  const loaded = () => scheduleIdle();
  const visible = () => {
    if (document.visibilityState !== 'hidden') {
      document.removeEventListener('visibilitychange', visible);
      scheduleIdle();
    }
  };
  cancelAssistantStartup = cancel;
  if (document.readyState === 'complete') scheduleIdle();
  else window.addEventListener('load', loaded, { once: true });
}

function emitInteraction(kind: Extract<ShopEvent, { type: 'interaction' }>['kind']): void {
  if (!demoDestroyed && assistant) adapter.emit({ type: 'interaction', kind });
}

async function restoreAssistant(): Promise<void> {
  if (demoDestroyed) return;
  const context = adapter.getContext();
  if (
    restoringAssistant ||
    context.ui.blockers.length ||
    !context.ui.floatingAllowed ||
    ['payment', 'account'].includes(context.pageType)
  )
    return;
  restoringAssistant = true;
  try {
    const instance = await initializeAssistant();
    if (demoDestroyed) return;
    const current = adapter.getContext();
    if (
      current.ui.blockers.length ||
      !current.ui.floatingAllowed ||
      ['payment', 'account'].includes(current.pageType)
    )
      return;
    if (!instance || !document.querySelector('anime-shop-assistant')) {
      showMessage('Помощник пока недоступен. Магазин продолжает работать.', true);
      return;
    }
    await instance.restore();
  } catch (error: unknown) {
    console.warn('Failed to restore companion:', error);
    showMessage('Не удалось открыть помощника. Попробуй ещё раз.', true);
  } finally {
    restoringAssistant = false;
  }
}

async function runScenario(name: string): Promise<void> {
  if (demoDestroyed) return;
  if (name === 'summon') await restoreAssistant();
  if (name === 'grab') {
    await restoreAssistant();
    scenarioStatus(
      'Drag the companion up and release. It stays where it lands.',
    );
  }
  if (
    [
      'stroll',
      'climb',
      'peek',
      'wiggle',
      'flip',
      'arrival',
      'sit',
      'scratch',
      'ears',
      'stretch',
      'nose',
      'guitar',
    ].includes(name)
  ) {
    const instance = await initializeAssistant();
    const performer = instance;
    const host = document.querySelector<HTMLElement>('anime-shop-assistant');
    if (!performer?.perform || !host) {
      scenarioStatus('Companion is initializing. Try again shortly.');
      return;
    }
    if (host.dataset.state === 'hiddenByUser') {
      scenarioStatus('Restore the hidden companion first.');
      return;
    }
    if (host.dataset.state === 'suppressed') {
      scenarioStatus('Companion suppressed. Close the shop dialog and try again.');
      return;
    }
    scenarioStatus(
      (
        {
          sit: 'Playing sit.',
          scratch: 'Playing cheek scratch.',
          ears: 'Playing ear gestures.',
          stretch: 'Playing stretch.',
          nose: 'Playing nose twitch.',
          guitar: 'Playing electric guitar and tail wiggle.',
          stroll: 'Walking.',
          climb: 'Climbing.',
          peek: 'Hiding and peeking.',
          wiggle: 'Playing tail wiggle.',
          flip: 'Playing flip.',
          arrival: 'Starting arrival.',
        } as Record<string, string>
      )[name]!,
    );
    await performer.perform(name as DemoScene);
  }
  if (name === 'interest') {
    await initializeAssistant();
    emitInteraction('product:enter');
    setTimeout(() => emitInteraction('product:leave'), 2000);
    scenarioStatus('Product hover event emitted.');
  }
  if (name === 'success') await addProduct('electric-sun');
  if (name === 'error') {
    await initializeAssistant();
    await addProduct('electric-sun', { fail: true });
  }
  if (name === 'duplicate') {
    if (!lastAddedEvent) await addProduct('electric-sun');
    if (lastAddedEvent) adapter.emit(lastAddedEvent);
    scenarioStatus('Event ID repeated. Cart count and reaction must not repeat.');
  }
  if (name === 'rapid') {
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        addProduct(products[index]!.id, { delay: 120 + index * 50 }),
      ),
    );
    scenarioStatus(`5 cart updates confirmed. Cart count: ${cartCount()}.`);
  }
  if (name === 'unknown') {
    adapter.update({ cartCount: null });
    scenarioStatus(
      'Cart count unknown. The next item added will update it.',
    );
  }
  if (name === 'blockers') {
    blockers.add('demo-blocker-a');
    blockers.add('demo-blocker-b');
    publishUi();
    scenarioStatus('2 independent blockers active. Companion suppressed.');
  }
  if (name === 'unblock-one') {
    blockers.delete('demo-blocker-a');
    publishUi();
    scenarioStatus('First blocker removed. Companion remains suppressed.');
  }
  if (name === 'unblock-all') {
    blockers.delete('demo-blocker-a');
    blockers.delete('demo-blocker-b');
    publishUi();
    scenarioStatus('Both blockers removed.');
  }
  if (name === 'sticky') {
    document.querySelector<HTMLElement>('.sticky-buy')!.hidden =
      !document.querySelector<HTMLElement>('.sticky-buy')!.hidden;
    publishUi();
    scenarioStatus('Sticky buy panel toggled. bottomReservedPx updated.');
  }
  if (name === 'storage') {
    toggleStorageFailure(true);
    await reinitialize();
    scenarioStatus(
      'Storage methods throw SecurityError. Settings stay in memory until diagnostics are reset.',
    );
  }
  if (name === 'graphics') {
    await reinitialize(true);
    scenarioStatus('Artwork unavailable. Companion controls disabled; shop remains usable.');
  }
  if (name === 'reinit') {
    const previous = await initializeAssistant();
    if (demoDestroyed) return;
    const { init } = await assistantModulePromise!;
    if (demoDestroyed) return;
    const pending = init({ configUrl: siteUrl('/demo/assistant.config.json'), adapter, signal: demoAbort.signal });
    assistantInitPromise = pending;
    const instance = await pending;
    if (demoDestroyed) { await instance.destroy(); return; }
    assistant = instance;
    syncAssistantControls();
    syncCartCompanion();
    companionSkills?.refresh();
    scenarioStatus(
      `Repeated init: ${previous === assistant ? 'instance reused' : 'instance replaced'}. Adapter subscribers: ${adapter.subscriberCount}.`,
    );
  }
  if (name === 'reset') {
    toggleStorageFailure(false);
    blockers.clear();
    closeAllDialogs();
    adapter.update({ cartCount: cartCount(), permissions: { persistentSettings: true } });
    document.querySelector<HTMLInputElement>('#persistent-permission')!.checked = true;
    await reinitialize();
    renderPage(false);
    scenarioStatus('Diagnostics reset. Settings and cart preserved.');
  }
}

function destroyDemo(): Promise<void> {
  if (demoDestruction) return demoDestruction;
  demoDestroyed = true;
  demoDestruction = Promise.resolve().then(async () => {
    cancelRouteMotion();
    companionSkills?.destroy();
    companionSkills = undefined;
    animatedSky.destroy();
    if (messageTimer) clearTimeout(messageTimer);
    try {
      const pending = await assistantInitPromise?.catch(() => undefined);
      await (assistant ?? pending)?.destroy();
    } finally {
      cartCompanionMount = null;
      if (brokenConfigUrl) URL.revokeObjectURL(brokenConfigUrl);
    }
  });
  demoAbort.abort();
  cancelAssistantStartup?.();
  assistantHostObserver.disconnect();
  bottomPanelObserver?.disconnect();
  return demoDestruction;
}

document.addEventListener('click', (event) => {
  const target = event.target as Element;
  const sortChoice = target.closest<HTMLButtonElement>('[data-sort]');
  if (sortChoice) {
    const picker = sortChoice.closest<HTMLDetailsElement>('.sort-picker');
    const select = picker?.querySelector<HTMLSelectElement>('#sort-order');
    if (picker) picker.open = false;
    if (select && select.value !== sortChoice.dataset.sort) {
      select.value = sortChoice.dataset.sort!;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
    document.querySelector<HTMLElement>('.sort-picker-trigger')?.focus({ preventScroll: true });
    return;
  }
  document.querySelectorAll<HTMLDetailsElement>('.sort-picker[open]').forEach((picker) => {
    if (!picker.contains(target)) picker.open = false;
  });
  const link = target.closest<HTMLAnchorElement>('a[href]');
  if (
    link &&
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !link.download &&
    !link.target
  ) {
    const href = link.getAttribute('href')!;
    const url = new URL(link.href, location.href);
    if (
      !href.startsWith('#') &&
      url.origin === location.origin &&
      routePath(url.pathname) !== null
    ) {
      event.preventDefault();
      void navigate(url.href, event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined);
      return;
    }
  }
  const dialogTrigger = target.closest<HTMLElement>('[data-dialog]');
  if (dialogTrigger) {
    openDialog(dialogTrigger.dataset.dialog!);
    return;
  }
  const close = target.closest<HTMLElement>('[data-close]');
  if (close) {
    closeDialog(close.dataset.close!);
    return;
  }
  const add = target.closest<HTMLButtonElement>('[data-add]');
  if (add && !add.disabled) {
    void addProduct(add.dataset.add!);
    return;
  }
  const remove = target.closest<HTMLElement>('[data-remove]');
  if (remove) {
    cart.delete(remove.dataset.remove!);
    adapter.update({ cartCount: cartCount() });
    updateCartUi();
    return;
  }
  const quantity = target.closest<HTMLElement>('[data-quantity]');
  if (quantity) {
    const id = quantity.dataset.quantity!;
    const next = (cart.get(id) ?? 0) + Number(quantity.dataset.delta);
    if (next <= 0) cart.delete(id);
    else cart.set(id, next);
    adapter.update({ cartCount: cartCount() });
    updateCartUi();
    return;
  }
  if (target.closest('[data-restore]')) {
    void restoreAssistant();
    return;
  }
  if (target.closest('[data-cookie-save]')) {
    adapter.update({
      permissions: {
        persistentSettings:
          document.querySelector<HTMLInputElement>('#persistent-permission')!.checked,
      },
    });
    closeDialog('cookie');
    showMessage('Твой выбор сохранён.');
    return;
  }
  const scenario = target.closest<HTMLElement>('[data-scenario]');
  if (scenario) {
    void runScenario(scenario.dataset.scenario!).catch((error: unknown) =>
      scenarioStatus(`Scenario failed: ${String(error)}`),
    );
  }
}, demoListenerOptions);

document.querySelectorAll<HTMLDialogElement>('.shop-dialog').forEach((dialog) => {
  const kind = dialog.id.replace('-dialog', '');
  dialog.addEventListener('cancel', () => {
    queueMicrotask(() => {
      if (demoDestroyed || dialog.open) return;
      blockers.delete(dialogBlockers[kind]!);
      publishUi();
    });
  }, demoListenerOptions);
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    blockers.delete(dialogBlockers[kind]!);
    publishUi();
  }, demoListenerOptions);
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      closeDialog(kind);
  }, demoListenerOptions);
});
document.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'shop-search') updateSearch(target.value);
}, demoListenerOptions);
document.addEventListener('pointerover', (event) => {
  const card = (event.target as Element).closest('.product-card,.product-detail-art');
  if (card && !(event.relatedTarget instanceof Node && card.contains(event.relatedTarget)))
    emitInteraction('product:enter');
}, demoListenerOptions);
document.addEventListener('pointerout', (event) => {
  const card = (event.target as Element).closest('.product-card,.product-detail-art');
  if (card && !(event.relatedTarget instanceof Node && card.contains(event.relatedTarget)))
    emitInteraction('product:leave');
}, demoListenerOptions);
document.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement;
  if (target.id === 'sort-order') {
    if (!['featured', 'price-asc', 'price-desc'].includes(target.value)) return;
    if (target.value === sortOrder) return;
    sortOrder = target.value;
    const scroll = window.scrollY;
    renderPage(false, undefined, true);
    window.scrollTo({ top: scroll, behavior: 'instant' });
  }
}, demoListenerOptions);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const picker = document.querySelector<HTMLDetailsElement>('.sort-picker[open]');
  if (!picker) return;
  picker.open = false;
  picker.querySelector<HTMLElement>('.sort-picker-trigger')?.focus({ preventScroll: true });
}, demoListenerOptions);
document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  if (!['checkout-form', 'contact-form', 'search-form'].includes(form.id)) return;
  event.preventDefault();
  if (form.id === 'checkout-form') void navigate('/payment');
  if (form.id === 'contact-form') {
    showMessage('Форма проверена. Сообщение не отправлено.');
    form.reset();
  }
}, demoListenerOptions);
window.addEventListener('popstate', () => {
  if (`${routePath(location.pathname) ?? ''}${location.search}` === renderedRoute) {
    ++pageSequence;
    cancelRouteMotion();
    return;
  }
  closeAllDialogs();
  renderPage();
}, demoListenerOptions);
mobileMedia.addEventListener('change', () => publishUi(), demoListenerOptions);
function observeBottomPanels(): void {
  if (demoDestroyed || demoSuspended || !bottomPanelObserver) return;
  app
    .querySelectorAll('.mobile-bottom-nav,.sticky-buy')
    .forEach((panel) => bottomPanelObserver!.observe(panel, { box: 'border-box' }));
}
if (typeof window.ResizeObserver === 'function') {
  bottomPanelObserver = new window.ResizeObserver(() => {
    if (demoDestroyed || demoSuspended) return;
    if (bottomReservedHeight() !== adapter.getContext().ui.bottomReservedPx) publishUi();
  });
  observeBottomPanels();
}
pageMotionMedia.addEventListener('change', () => cancelRouteMotion(true), demoListenerOptions);
window.addEventListener('pagehide', () => {
  demoSuspended = true;
  assistantHostObserver.disconnect();
  bottomPanelObserver?.disconnect();
  cancelRouteMotion(true);
}, demoListenerOptions);
window.addEventListener('pageshow', () => {
  demoSuspended = false;
  syncAssistantControls();
  observeBottomPanels();
}, demoListenerOptions);
window.addEventListener('resize', () => cancelRouteMotion(true), demoListenerOptions);
const onViewportChange = () => {
  const viewport = window.visualViewport;
  const original = pageEntry?.viewport;
  // Keep page contact fixed when a route changes the scrollbar width.
  if (viewport && original && window.innerWidth === original.windowWidth &&
      window.innerHeight === original.windowHeight && viewport.height === original.height &&
      viewport.offsetLeft === original.left && viewport.offsetTop === original.top &&
      (viewport.scale ?? 1) === original.scale) return;
  cancelRouteMotion(true);
};
window.visualViewport?.addEventListener('resize', onViewportChange, demoListenerOptions);
window.visualViewport?.addEventListener('scroll', onViewportChange, demoListenerOptions);

Object.defineProperty(window, 'pikaDemo', {
  value: {
    adapter,
    navigate,
    addProduct,
    openDialog,
    closeDialog,
    runScenario,
    destroy: destroyDemo,
    get assistant() {
      return assistant;
    },
    get storageFailure() {
      return storageFailure;
    },
    get cartCount() {
      return cartCount();
    },
  },
});
renderPage();
scheduleAssistantStartup();
