import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ART_IDS, renderCardArt } from './card-art.mjs';

export const BOOK_IDS = [...ART_IDS];

const books = {
  'electric-sun': {
    title: ['Фонарь', 'первого рассвета'],
    sizes: [38, 28],
    author: 'Ася Листова',
    world: 'СКАЗКИ ЛИСТОЛЕСЬЯ',
    paper: '#f5e7cb',
    binding: '#9b7750',
    ink: '#594c39',
    gold: '#ad8c52',
    motif: 'sun',
  },
  'moon-guardian': {
    title: ['Найра и', 'лунные письма'],
    sizes: [35, 30],
    author: 'Мира Светлова',
    world: 'СКАЗКИ ЛУНАРЫ',
    paper: '#e9e6f0',
    binding: '#777792',
    ink: '#535370',
    gold: '#a9936d',
    motif: 'moon',
  },
  'forest-spirit': {
    title: ['Мохлик и', 'тропа чудес'],
    sizes: [35, 34],
    author: 'Ася Листова',
    world: 'СКАЗКИ ЛИСТОЛЕСЬЯ',
    paper: '#e4ead4',
    binding: '#718768',
    ink: '#42583e',
    gold: '#a39457',
    motif: 'leaf',
  },
  'crimson-fox': {
    title: ['Рэйна и секрет', 'лисьей маски'],
    sizes: [29, 32],
    author: 'Лея Искрова',
    world: 'СКАЗКИ ИСКРОВЕЛЯ',
    paper: '#f1dfd2',
    binding: '#a47767',
    ink: '#6e5147',
    gold: '#b38c60',
    motif: 'flower',
  },
  'sky-dragon': {
    title: ['Аэрви и', 'облачные острова'],
    sizes: [36, 27],
    author: 'Ника Ветрова',
    world: 'СКАЗКИ АЭРОЛИНА',
    paper: '#dfebeb',
    binding: '#7193a0',
    ink: '#486572',
    gold: '#a3946c',
    motif: 'cloud',
  },
  'star-witch': {
    title: ['Лиора и', 'атлас звёзд'],
    sizes: [36, 34],
    author: 'Мира Светлова',
    world: 'СКАЗКИ ЛУНАРЫ',
    paper: '#eee0e6',
    binding: '#a18092',
    ink: '#705369',
    gold: '#ad9067',
    motif: 'star',
  },
};

function sparkle(x, y, size, color) {
  return `<path d="M${x} ${y - size} Q${x + 2} ${y - 2} ${x + size} ${y} Q${x + 2} ${y + 2} ${x} ${y + size} Q${x - 2} ${y + 2} ${x - size} ${y} Q${x - 2} ${y - 2} ${x} ${y - size}Z" fill="${color}"/>`;
}

function emblem(motif, color) {
  const shapes = {
    sun: '<circle r="7"/><path d="M0-13V-10M0 10V13M-13 0H-10M10 0H13M-9-9L-7-7M7 7L9 9M9-9L7-7M-7 7L-9 9"/>',
    moon: '<path d="M5-11A12 12 0 1 0 8 10Q-5 9-5-2Q-5-8 5-11Z"/>',
    leaf: '<path d="M-12 9Q-15-9 13-12Q16 7-12 9ZM-9 7L9-8M-3 2L-4-5M2-2L8 0"/>',
    flower:
      '<path d="M0-5C-17-20-20 4-5 4C-18 21 10 21 5 5C23 12 25-13 8-9C10-26-11-26 0-5Z"/><circle r="3"/>',
    cloud:
      '<path d="M-13 7Q-20 4-14-3Q-10-7-5-4Q-4-16 6-12Q12-10 11-3Q20-5 21 3Q21 7 15 7Z"/><path d="M-7 12H9"/>',
    star: '<path d="M0-13L4-4L14-3L6 3L8 13L0 8L-8 13L-6 3L-14-3L-4-4Z"/>',
  };
  return `<g transform="translate(224 43)" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">${shapes[motif]}</g>`;
}

function botanicalBorder(gold) {
  // The small repeated leaves belong to the printed border, not the hero.
  let leaves = '';
  for (const y of [187, 219, 251, 411, 443, 475]) {
    leaves += `<path d="M48 ${y + 7}Q34 ${y - 2} 42 ${y - 10}Q54 ${y - 4}48 ${y + 7}ZM48 ${y + 12}Q61 ${y + 2}57 ${y - 4}Q45 ${y + 1}48 ${y + 12}Z"/>`;
  }
  return `<g fill="none" stroke="${gold}" stroke-width="1.1" opacity=".72">
    <path d="M48 168Q45 218 48 267M48 394Q45 446 48 498"/>${leaves}
    <g transform="translate(448 0) scale(-1 1)"><path d="M48 168Q45 218 48 267M48 394Q45 446 48 498"/>${leaves}</g>
  </g>`;
}

export function renderBookCover(id) {
  const book = books[id];
  if (!book) throw new Error(`Unknown book cover: ${id}`);
  // Reuse the original illustration as editable vector paths. Old card labels
  // are removed; names and chapter decorations are printed by this cover.
  const illustration = renderCardArt(id)
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, '')
    .replace(/id="([^"]+)"/g, 'id="picture-$1"')
    .replace(/url\(#([^)]+)\)/g, 'url(#picture-$1)');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="600" viewBox="0 0 440 600" role="img" aria-label="${book.title.join(' ')} — обложка сказки">
  <defs>
    <linearGradient id="cover-paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff8e9"/><stop offset=".48" stop-color="${book.paper}"/><stop offset="1" stop-color="${book.paper}"/></linearGradient>
    <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${book.binding}"/><stop offset=".58" stop-color="${book.binding}"/><stop offset="1" stop-color="${book.paper}"/></linearGradient>
    <clipPath id="picture-window"><path d="M66 494V306C66 102 379 102 379 306V494Q224 520 66 494Z"/></clipPath>
  </defs>
  <rect width="440" height="600" rx="10" fill="url(#cover-paper)"/>
  <path d="M10 0H26V600H10Q0 600 0 590V10Q0 0 10 0Z" fill="url(#spine)"/>
  <path d="M17 17V583M26 16V584" stroke="${book.gold}" stroke-width="1" opacity=".6"/>
  <path d="M6 48H19M6 53H19M6 547H19M6 552H19" stroke="#f6e8c9" stroke-width="1.1" opacity=".7"/>
  <rect x="34" y="20" width="380" height="560" rx="22" fill="none" stroke="${book.gold}" stroke-width="1.7"/>
  <rect x="40" y="26" width="368" height="548" rx="18" fill="none" stroke="${book.gold}" stroke-width=".8" opacity=".6"/>
  ${emblem(book.motif, book.gold)}
  <text x="224" y="79" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="${book.sizes[0]}" font-weight="bold" fill="${book.ink}">${book.title[0]}</text>
  <text x="224" y="119" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="${book.sizes[1]}" font-weight="bold" fill="${book.ink}">${book.title[1]}</text>
  <path d="M129 137H199M249 137H319" stroke="${book.gold}" stroke-width="1"/>
  ${sparkle(224, 137, 4, book.gold)}
  <g clip-path="url(#picture-window)"><g transform="translate(48 116) scale(.78)">${illustration}</g><rect x="66" y="150" width="313" height="370" fill="#fff8e9" opacity=".08"/></g>
  <path d="M66 494V306C66 102 379 102 379 306V494Q224 520 66 494Z" fill="none" stroke="${book.gold}" stroke-width="1.5"/>
  <path d="M72 489V306C72 110 373 110 373 306V489" fill="none" stroke="#fff7e4" stroke-width="1" opacity=".6"/>
  ${botanicalBorder(book.gold)}
  ${sparkle(49, 322, 6, book.gold)}${sparkle(399, 322, 6, book.gold)}
  <path d="M177 527Q197 517 217 527M231 527Q251 517 271 527" fill="none" stroke="${book.gold}" stroke-width="1"/>
  <circle cx="224" cy="526" r="2.2" fill="${book.gold}"/>
  <text x="224" y="548" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="19" fill="${book.ink}">${book.author}</text>
  <text x="224" y="568" text-anchor="middle" font-family="Arial,sans-serif" font-size="9.5" letter-spacing="2" fill="${book.ink}" opacity=".72">${book.world}</text>
  <path d="M433 12V588" stroke="#fffaf0" stroke-width="2" opacity=".72"/>
  </svg>`;
}

export async function exportBookCovers(sourceDirectory, artDirectory) {
  await mkdir(artDirectory, { recursive: true });
  for (const id of BOOK_IDS) {
    const svg = renderBookCover(id).replace(/[ \t]+$/gm, '');
    await writeFile(path.join(sourceDirectory, `book-${id}.svg`), svg, 'utf8');
    await writeFile(path.join(artDirectory, `book-${id}.svg`), svg, 'utf8');
  }
}
