export interface Product {
  id: string;
  name: string;
  series: string;
  category: string;
  art: string;
  price: number;
  tag: string;
  color: string;
  number: string;
  description: string;
  author: string;
  pages: number;
  age: string;
  format: string;
}

const artFiles: Record<string, string> = {
  'electric-sun': new URL('../assets/exported/art/book-electric-sun.svg', import.meta.url).href,
  'moon-guardian': new URL('../assets/exported/art/book-moon-guardian.svg', import.meta.url).href,
  'forest-spirit': new URL('../assets/exported/art/book-forest-spirit.svg', import.meta.url).href,
  'crimson-fox': new URL('../assets/exported/art/book-crimson-fox.svg', import.meta.url).href,
  'sky-dragon': new URL('../assets/exported/art/book-sky-dragon.svg', import.meta.url).href,
  'star-witch': new URL('../assets/exported/art/book-star-witch.svg', import.meta.url).href,
};
export const artUrl = (name: string): string =>
  artFiles[name] ?? `/assets/exported/art/${name}.svg`;

export const products: Product[] = [
  {
    id: 'electric-sun',
    name: 'Фонарь первого рассвета',
    series: 'Листолесье',
    category: 'listolesye',
    art: 'electric-sun',
    price: 690,
    tag: 'Добрая сказка',
    color: '#ede2d0',
    number: '001',
    description:
      'Когда утро заблудилось в лесу, Эллиан отправляется за первым солнечным лучом. Маленький янтарный фонарь помогает ему найти дорогу и увидеть, как даже самый тихий добрый поступок разгоняет темноту.',
    author: 'Ася Листова',
    pages: 48,
    age: '4+',
    format: 'Твёрдый переплёт',
  },
  {
    id: 'moon-guardian',
    name: 'Найра и лунные письма',
    series: 'Лунара',
    category: 'lunara',
    art: 'moon-guardian',
    price: 790,
    tag: 'Новинка',
    color: '#e4e1f3',
    number: '002',
    description:
      'Однажды серебряный мост приносит Найре письмо без адреса. Она идёт по следам лунного света, знакомится с сонными звёздами и узнаёт, кому так нужна весточка из далёкого дома.',
    author: 'Мира Светлова',
    pages: 64,
    age: '5+',
    format: 'Твёрдый переплёт',
  },
  {
    id: 'crimson-fox',
    name: 'Рэйна и секрет лисьей маски',
    series: 'Искровель',
    category: 'iskrovel',
    art: 'crimson-fox',
    price: 890,
    tag: 'Приключение',
    color: '#f0ddcf',
    number: '003',
    description:
      'Лисья маска Рэйны умеет находить потерянные вещи, но однажды прячет самый важный секрет сама. За озорными искрами друзья добираются до старой мельницы и учатся говорить правду даже тогда, когда это непросто.',
    author: 'Лея Искрова',
    pages: 72,
    age: '6+',
    format: 'Твёрдый переплёт',
  },
  {
    id: 'sky-dragon',
    name: 'Аэрви и облачные острова',
    series: 'Аэролин',
    category: 'aerolin',
    art: 'sky-dragon',
    price: 790,
    tag: 'Новинка',
    color: '#dce8ed',
    number: '004',
    description:
      'У маленького Аэрви пока не получается летать так высоко, как у больших драконов. Но когда ветер разносит облачные острова, именно его внимательность и верные друзья помогают собрать небо снова.',
    author: 'Ника Ветрова',
    pages: 64,
    age: '4+',
    format: 'Твёрдый переплёт',
  },
  {
    id: 'forest-spirit',
    name: 'Мохлик и тропа чудес',
    series: 'Листолесье',
    category: 'listolesye',
    art: 'forest-spirit',
    price: 590,
    tag: 'Любимый герой',
    color: '#e3e8d8',
    number: '005',
    description:
      'Мохлик замечает крохотную тропинку, которой вчера ещё не было. Она ведёт к ручью, забытому саду и очень застенчивому чуду. Уютная история о дружбе, любопытстве и маленьких находках на большой прогулке.',
    author: 'Ася Листова',
    pages: 40,
    age: '3+',
    format: 'Твёрдый переплёт',
  },
  {
    id: 'star-witch',
    name: 'Лиора и атлас звёзд',
    series: 'Лунара',
    category: 'lunara',
    art: 'star-witch',
    price: 890,
    tag: 'Новинка',
    color: '#eee0e6',
    number: '006',
    description:
      'Лиора собирает мечты в маленький атлас, а по ночам вышивает из них созвездия. Когда одна звезда теряет своё имя, девочка отправляется в тихое путешествие по небу, чтобы помочь ей вспомнить себя.',
    author: 'Мира Светлова',
    pages: 56,
    age: '5+',
    format: 'Твёрдый переплёт',
  },
];

export const categories = [
  { id: 'all', label: 'Все миры', glyph: '✳' },
  { id: 'listolesye', label: 'Листолесье', glyph: '✳' },
  { id: 'iskrovel', label: 'Искровель', glyph: '✹' },
  { id: 'aerolin', label: 'Аэролин', glyph: '≈' },
  { id: 'lunara', label: 'Лунара', glyph: '☾' },
];

export const formatPrice = (value: number): string =>
  `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
