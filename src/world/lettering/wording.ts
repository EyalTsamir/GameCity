// The words of the city: who keeps which shop, what it sells and when it opens, who lives and works where, what the
// bills, notices and papers say. Deterministic (the same lot always reads the same), so that the shop signs in the
// buildings module and the fine print in the lettering module tell one story. All names are invented.

import { ICON } from './font';
import { FACE, type Face } from './font';

// ─────────────────────────────────────────────────────────── a small stream ──

export type R = () => number;

/** a stream of numbers from a seed (mulberry32) */
export function stream(seed: number): R {
  let s = seed >>> 0 || 1;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
export const int = (r: R, a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
export function some<T>(r: R, a: readonly T[], n: number): T[] {
  const c = a.slice();
  const out: T[] = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(r() * c.length), 1)[0]);
  return out;
}

export const hashText = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

// ───────────────────────────────────────────────────────────── people ──

export const SURNAMES = [
  'Hartley', 'Pryce', 'Okafor', 'Lindqvist', 'Marchetti', 'Bellamy', 'Novak', 'Ashworth', 'Penhale', 'Kowalski', 'Trevena', 'Dubois', 'Haldane', 'Mirza', 'Castellano', 'Whitlock', 'Oyelaran', 'Fenwick', 'Tanaka', 'Sorensen',
  'Rourke', 'Adeyemi', 'Calloway', 'Brandt', 'Quigley', 'Petrov', 'Lacey', 'Nakamura', 'Thorne', 'Vasquez', 'Holloway', 'Iyer', 'Pemberton', 'Kaplan', 'Goss', 'Moreau', 'Finch', 'Rahman', 'Ellery', 'Sandoval',
  'Tolland', 'Bianchi', 'Crane', 'Osei', 'Merrick', 'Yilmaz', 'Duffy', 'Halloran', 'Winslow', 'Papadakis', 'Stroud', 'Eriksen', 'Bramwell', 'Costa', 'Vane', 'Mbeki', 'Larkin', 'Hughes', 'Ferrante', 'Nowak',
  'Abbott', 'Gallagher', 'Rosen', 'Tully', 'Keating', 'Hakimi', 'Barlow', 'Sato', 'Pascoe', 'Lund', 'Greaves', 'Amato', 'Dalton', 'Khoury', 'Sweeney', 'Varga', 'Cobb', 'Ibarra', 'Wren', 'Olsen',
  'Tregear', 'Nair', 'Beck', 'Kerrigan', 'Ansah', 'Fairley', 'Lombardi', 'Moss', 'Zielinski', 'Harker', 'Doyle', 'Ferris', 'Haddad', 'Prentice', 'Jansen', 'Rudd', 'Levy', 'Mallory', 'Cheung', 'Teague',
];
export const FIRSTS = [
  'Anna', 'Tomas', 'Grace', 'Ibrahim', 'Rosa', 'Peter', 'Mei', 'Owen', 'Lucia', 'Daniel', 'Priya', 'Sam', 'Elsa', 'Jonah', 'Amara', 'Hugo', 'Nell', 'Marek', 'Ines', 'Callum',
  'Yusuf', 'Ada', 'Felix', 'Hana', 'Ruth', 'Leon', 'Maya', 'Arthur', 'Sofia', 'Ben', 'Tess', 'Karim', 'Joan', 'Niko', 'Clara', 'Wes', 'Dilys', 'Oskar', 'Bea', 'Luca',
];

const surname = (r: R): string => pick(r, SURNAMES);
const first = (r: R): string => pick(r, FIRSTS);
const initials = (r: R): string => `${String.fromCharCode(65 + int(r, 0, 25))}.${r() < 0.4 ? String.fromCharCode(65 + int(r, 0, 25)) + '.' : ''}`;

export const phone = (r: R): string => `01632 96${int(r, 0, 9)} ${int(r, 100, 999)}`;

// ────────────────────────────────────────────────────────── opening hours ──

/** one week: [open, close] in hours for weekdays, Saturday and Sunday (null closed) and a day it stays shut */
export interface Week {
  wk: [number, number];
  sat: [number, number] | null;
  sun: [number, number] | null;
  shut?: string;
}

const W = (a: number, b: number, s: [number, number] | null, u: [number, number] | null = null, shut?: string): Week => ({ wk: [a, b], sat: s, sun: u, shut });
const HOURS = {
  shop: [W(9, 17.5, [9, 17]), W(9.5, 17.5, [9.5, 17]), W(9, 18, [9, 18], [11, 16]), W(10, 18, [10, 17.5], null, 'Mon'), W(8.5, 17, [9, 16])],
  early: [W(7, 16, [7, 15]), W(6.5, 15, [7, 14], null, 'Mon'), W(7.5, 17, [7.5, 16], [8, 13]), W(7, 17.5, [7, 15])],
  food: [W(12, 22, [12, 23], [12, 21]), W(17, 22.5, [12, 23], [12, 20], 'Mon'), W(11.5, 22, [11.5, 22.5], null), W(12, 21.5, [12, 22], [12, 16], 'Tue')],
  cafe: [W(8, 17, [8, 17.5], [9, 16]), W(7.5, 18, [8, 18], [9, 17]), W(8, 16.5, [9, 16], null), W(7, 19, [8, 19], [8, 18])],
  pub: [W(11, 23, [11, 23.5], [12, 22.5]), W(12, 23, [11, 24], [12, 22])],
  bar: [W(16, 23, [14, 24], [14, 22], 'Mon'), W(17, 23.5, [15, 24], null, 'Tue')],
  sweet: [W(11, 20, [10, 21], [10, 20]), W(12, 19, [11, 20], [11, 19], 'Mon')],
  office: [W(9, 17, null), W(8.5, 17.5, null), W(9, 16.5, [9.5, 12.5])],
  chip: [W(11.5, 21.5, [11.5, 22], [12, 20]), W(16, 22, [12, 22.5], null, 'Mon')],
} as const;

const clock = (h: number): string => {
  const hh = Math.floor(h),
    mm = Math.round((h - hh) * 60);
  return `${hh === 24 ? '12' : hh > 12 ? hh - 12 : hh}${mm ? '.' + String(mm).padStart(2, '0') : ''}${hh === 24 ? 'am' : hh >= 12 ? 'pm' : 'am'}`;
};
const span = (a: readonly number[]): string => `${clock(a[0])} – ${clock(a[1])}`;

/** the lines of an hours card: [days, times] */
export function weekLines(w: Week): [string, string][] {
  const out: [string, string][] = [];
  if (w.shut === 'Mon') out.push(['Monday', 'Closed'], ['Tue – Fri', span(w.wk)]);
  else if (w.shut === 'Tue') out.push(['Monday', span(w.wk)], ['Tuesday', 'Closed'], ['Wed – Fri', span(w.wk)]);
  else out.push(['Mon – Fri', span(w.wk)]);
  out.push(['Saturday', w.sat ? span(w.sat) : 'Closed']);
  out.push(['Sunday', w.sun ? span(w.sun) : 'Closed']);
  return out;
}

// ──────────────────────────────────────────────────────────────── trades ──

interface MenuDef {
  head: string;
  sections: [string, [string, number][]][];
}

interface Trade {
  id: string;
  /** {S} surname, {F} first name, {I} initials, {St} the street's first word */
  titles: string[];
  straps: string[];
  /** lettering on the display window */
  glass: string[];
  /** paper in the window */
  offers: string[];
  hours: readonly Week[];
  faces: Face[];
  icon: string;
  menu?: MenuDef;
  /** on the blackboard */
  chalk?: string[];
}

const COFFEE: [string, number][] = [['Espresso', 2.2], ['Flat white', 3.1], ['Cappuccino', 3.2], ['Latte', 3.2], ['Filter, bottomless', 2.8], ['Hot chocolate', 3.4], ['Pot of tea', 2.6], ['Fresh mint tea', 2.6]];
const PUB: MenuDef = {
  head: 'From the kitchen',
  sections: [
    ['Starters', [['Soup of the day, bread', 6.5], ['Potted shrimp, toast', 8.5], ['Whitebait, lemon mayo', 7.5], ['Scotch egg, piccalilli', 6]]],
    ['Mains', [['Beer-battered haddock, chips, peas', 15.5], ['Steak & ale pie, mash', 16], ['Harbour fish stew', 17.5], ['Ham, egg & chips', 13], ['Mushroom & leek pie', 14], ['Quay burger, slaw', 14.5]]],
    ['Puddings', [['Sticky toffee pudding', 7], ['Apple crumble, custard', 6.5], ['Cheese board', 9]]],
  ],
};

const TRADES: Trade[] = [
  {
    id: 'bakery',
    titles: ["{S}'s Bakery", '{S} & Daughters', 'The Daily Crumb', 'Bread & Salt', "{F}'s Bakehouse", 'The Flour Mill', '{St} Bakery', '{S} Bakers', 'Crust & Crumb', 'The Rising Loaf', 'Harbour Bakehouse', '{S} Family Bakers'],
    straps: ['Family bakers since {Y}', 'Baked on the premises', 'Bread · Cakes · Savouries', 'Sourdough & sweet things', 'Fresh every morning from 5am', 'Craft bakers'],
    glass: ['Fresh bread daily', 'Celebration cakes to order', 'Hot sausage rolls', 'Sourdough · Rye · Seeded', 'Cakes made to order', 'Baked here every morning'],
    offers: ['Wedding & birthday cakes – ask inside', "Today's bread: white, seeded, rye, sourdough", 'Sold out by noon? Order the day before', 'Saturday girl wanted – ask at the counter', 'Hot cross buns from Thursday'],
    hours: HOURS.early,
    faces: [FACE.SERIF_B, FACE.SCRIPT, FACE.HUMAN],
    icon: ICON.loaf,
    chalk: ['Hot rolls!', 'Cheese scones', 'Sausage rolls £2.40', 'Coffee to go', 'Almond croissants', 'Rye today'],
  },
  {
    id: 'cafe',
    titles: ['Café Rosa', 'Café {S}', 'The Corner Cup', "{F}'s Kitchen", 'Harbour Lights Café', 'Morning Glory', 'The Copper Kettle', 'Café Nord', 'Bean & Gone', 'The Good Egg', 'Third Street Coffee', 'Café Marina', '{St} Coffee House', 'The Daily Grind'],
    straps: ['Coffee · Breakfast · Lunch', 'Roasted in Tinyhaven', 'All-day breakfast', 'Good coffee, nothing fancy', 'Homemade cakes', 'Since {Y}'],
    glass: ['Breakfast served all day', 'Good coffee & homemade cakes', 'Free wi-fi · Dogs welcome', 'Takeaway coffee', 'Soup · Sandwiches · Cakes'],
    offers: ['Open mic – last Thursday of the month', 'Loyalty card: the tenth coffee is on us', 'We roast our own beans', 'Staff wanted – weekends', 'Cakes baked by Mrs ' + 'Pascoe'],
    hours: HOURS.cafe,
    faces: [FACE.SCRIPT, FACE.SERIF_B, FACE.BLACK, FACE.HUMAN],
    icon: ICON.cup,
    menu: {
      head: 'Menu',
      sections: [
        ['Breakfast', [['Full breakfast', 9.5], ['Eggs on sourdough', 6.5], ['Bacon roll', 4.5], ['Porridge, honey', 4.2], ['Smoked haddock, poached egg', 9]]],
        ['Lunch', [['Soup & bread', 5.8], ['Cheese toastie', 5.5], ['Crab sandwich', 8.5], ['Quiche & salad', 7.8], ['Jacket potato', 6.5]]],
        ['Coffee & tea', COFFEE],
        ['Cakes', [['Lemon drizzle', 3.2], ['Carrot cake', 3.4], ['Scone, jam, cream', 3.8]]],
      ],
    },
    chalk: ['Soup today: leek & potato', 'Flat white £3.10', 'Homemade lemon drizzle', 'Dogs welcome', 'Crab sandwiches', 'Breakfast till noon'],
  },
  {
    id: 'books',
    titles: ['{S} Books', 'The Book Nook', 'Dog-Eared', 'Second Chapter', 'Harbour Books', '{S} & Co Booksellers', 'Page & Turner', 'Quayside Books', 'The Reading Room', 'Marginalia', '{St} Bookshop', 'Books & Co'],
    straps: ['New & second-hand books', 'Booksellers since {Y}', 'Maps · Charts · Local history', 'Books bought & sold', 'Antiquarian & used'],
    glass: ['New & second-hand', 'Books bought', 'Local history · Maps · Sea charts', 'Book tokens sold here', "Children's corner upstairs"],
    offers: ['Book group: first Tuesday, 7pm', 'Author talk on Saturday – free', 'We buy books. Ask inside', 'Three paperbacks for £5', 'Tide tables now in stock'],
    hours: HOURS.shop,
    faces: [FACE.SERIF_B, FACE.SERIF, FACE.HUMAN],
    icon: ICON.book,
  },
  {
    id: 'florist',
    titles: ['Petal & Stem', "{F}'s Flowers", '{S} Florist', 'Wild & Bloom', 'The Flower Shop', 'Fleur', 'Thistle & Rose', 'Bloom on {St}', 'The Potting Shed', '{S} & Daughter Flowers'],
    straps: ['Flowers for every occasion', 'Weddings · Funerals · Gifts', 'Cut flowers & house plants', 'Fresh from the market daily', 'Local delivery'],
    glass: ['Flowers for all occasions', 'Weddings & funerals', 'Same-day local delivery', 'Bouquets from £12'],
    offers: ['Order early for Saturday', 'Wreaths to order', 'Bulbs now in', 'House plants half price'],
    hours: HOURS.shop,
    faces: [FACE.SCRIPT, FACE.SERIF_B],
    icon: ICON.flower,
  },
  {
    id: 'deli',
    titles: ['{S} Delicatessen', 'Salt & Vine', 'The Larder', 'Olive & Oak', '{S} Fine Foods', 'Deli on {St}', 'Mercato', "{F}'s Pantry", 'The Good Pantry', 'Deli Market'],
    straps: ['Cheese · Charcuterie · Olives', 'Fine foods & wines', 'Sandwiches made to order', 'Local & imported'],
    glass: ['Fresh pasta daily', 'Cheese · Ham · Olives', 'Sandwiches made to order', 'Hampers to order'],
    offers: ['Hampers from £25', 'Tasting on Saturday', 'Ask about our olive oil', 'Lunch box deal £6.50'],
    hours: HOURS.shop,
    faces: [FACE.SERIF_B, FACE.BLACK],
    icon: ICON.fork,
    chalk: ['Porchetta rolls', 'Fresh pasta today', 'Olives £3 a tub', 'Hampers to order'],
  },
  {
    id: 'cheese',
    titles: ['The Cheese Shop', "{S}'s Cheeses", 'Curd & Rind', 'The Cheese Counter', 'Rind', 'Say Cheese'],
    straps: ['Over 120 cheeses', 'Farmhouse cheese & wine', 'Cut to order', 'British & continental'],
    glass: ['Farmhouse cheese', 'Cut to order', 'Crackers · Chutney · Wine'],
    offers: ['Cheese of the week: Haven Blue', 'Wedding cheese towers', 'Tasting Friday 5pm'],
    hours: HOURS.shop,
    faces: [FACE.SERIF_B, FACE.SCRIPT],
    icon: ICON.cheese,
  },
  {
    id: 'butcher',
    titles: ['{S} & Sons', '{S} Family Butchers', "{S}'s Butchers", 'The Butchers Block', '{St} Butchers', '{I} {S}, Butcher'],
    straps: ['Family butchers since {Y}', 'Locally reared meat', 'Home-cured bacon', 'Pies made on the premises'],
    glass: ['Home-made sausages', 'Locally reared beef & lamb', 'Pies · Bacon · Poultry', 'Freezer packs'],
    offers: ['Order your turkey now', 'BBQ pack £20', 'Sausage of the week: pork & apple', 'Whole lambs – ask'],
    hours: HOURS.early,
    faces: [FACE.SERIF_B, FACE.BLACK],
    icon: ICON.knife,
  },
  {
    id: 'chocolate',
    titles: ['Cocoa & Co', "{S}'s Chocolates", 'The Chocolate Box', 'Praline', 'Sweet Harbour'],
    straps: ['Handmade chocolates', 'Truffles · Pralines · Gifts', 'Made in Tinyhaven'],
    glass: ['Handmade on the premises', 'Truffles & pralines', 'Gift boxes'],
    offers: ['Sea salt caramels are back', 'Workshops on Sundays', 'Boxes from £8'],
    hours: HOURS.shop,
    faces: [FACE.SCRIPT, FACE.SERIF_B],
    icon: ICON.star,
  },
  {
    id: 'gelato',
    titles: ['Gelato {S}', 'Gelateria Marina', "{F}'s Gelato", 'Two Scoops', 'Il Gelato', 'The Cone Shop', 'Ice & Cream'],
    straps: ['Made fresh every morning', 'Italian ice cream', 'Gelato · Sorbet · Coffee'],
    glass: ['Made fresh daily', 'Sorbets · Sundaes · Coffee', '24 flavours'],
    offers: ['Flavour of the week: salted fig', 'Two scoops £3.80', 'Tubs to take home'],
    hours: HOURS.sweet,
    faces: [FACE.SCRIPT, FACE.BLACK],
    icon: ICON.cone,
    chalk: ['Salted caramel', 'Fig & honey', 'Two scoops £3.80', 'Lemon sorbet'],
  },
  {
    id: 'pharmacy',
    titles: ['{S} Pharmacy', '{St} Pharmacy', 'Harbour Pharmacy', '{S} Chemist', 'The Pharmacy', 'Haven Dispensary'],
    straps: ['Dispensing chemist', 'Prescriptions · Advice · Toiletries', 'Your local pharmacy'],
    glass: ['Prescriptions', 'Flu jabs now available', 'Ask your pharmacist', 'Travel health clinic'],
    offers: ['Flu jabs – walk in', 'Prescription collection service', 'Sun cream 3 for 2', 'Blood pressure checks free'],
    hours: HOURS.shop,
    faces: [FACE.HUMAN, FACE.SANS_B],
    icon: ICON.cross,
  },
  {
    id: 'barber',
    titles: ["{S}'s Barbers", 'Sharp & Sons', 'The Barber Shop', 'Short Back & Sides', "{F}'s", 'Quay Cuts', '{St} Barbers', 'The Close Shave'],
    straps: ['Gents hairdressing', 'Walk-ins welcome', 'Cut · Shave · Beard trim', 'Est. {Y}'],
    glass: ['Walk-ins welcome', 'Hot towel shave', 'Cut £14 · Shave £12'],
    offers: ['Boys under 12 £9', 'Pensioners Tuesdays £9', 'No appointment needed', 'Cash only'],
    hours: HOURS.shop,
    faces: [FACE.BLACK, FACE.SERIF_B],
    icon: ICON.scissors,
  },
  {
    id: 'bistro',
    titles: ['Bistro {S}', 'Le Petit Port', 'The Long Table', 'Bistro 22', 'Maison {S}', 'Salt Bistro', 'La Marée', 'Bistro on {St}'],
    straps: ['Seasonal cooking', 'Lunch · Dinner · Wine', 'Fresh from the harbour', 'Open kitchen'],
    glass: ['Seasonal menu', 'Lunch & dinner', 'Private parties'],
    offers: ['Set lunch: 2 courses £14', 'Book for Friday', 'Wine list inside'],
    hours: HOURS.food,
    faces: [FACE.SERIF_B, FACE.SCRIPT],
    icon: ICON.fork,
    menu: {
      head: 'À la carte',
      sections: [
        ['To start', [['Fish soup, rouille', 8.5], ['Goat cheese, beetroot', 8], ['Moules marinière', 9.5], ['Duck rillettes, cornichons', 8.5]]],
        ['To follow', [['Sea bream, fennel, lemon', 19], ['Steak frites', 21], ['Confit duck, lentils', 18.5], ['Mushroom risotto', 15], ['Catch of the day', 20]]],
        ['To finish', [['Tarte tatin', 7.5], ['Crème brûlée', 7], ['Chocolate pot', 7]]],
      ],
    },
    chalk: ['Set lunch £14', 'Moules today', 'Tarte tatin', 'Catch of the day: bream'],
  },
  {
    id: 'pizza',
    titles: ['Pizzeria {S}', 'Da Luca', 'Forno', 'Pizza Marina', 'Bella Napoli', 'The Stone Oven', 'Pizzeria Porto'],
    straps: ['Wood-fired since {Y}', 'Pizza · Pasta · Takeaway', 'Stone-baked', 'Eat in or take away'],
    glass: ['Wood-fired pizza', 'Eat in or take away', 'Tel. orders welcome'],
    offers: ['Lunch: any pizza £8', 'Delivery from 5pm', 'Children welcome'],
    hours: HOURS.food,
    faces: [FACE.SCRIPT, FACE.BLACK],
    icon: ICON.pizza,
    menu: {
      head: 'Pizze',
      sections: [
        ['Rosse', [['Margherita', 9], ['Napoli, anchovy, capers', 11], ['Diavola', 12], ['Capricciosa', 12.5], ['Quattro stagioni', 12.5], ['Marinara', 8]]],
        ['Bianche', [['Quattro formaggi', 12], ['Patate e rosmarino', 11], ['Salsiccia e friarielli', 13]]],
        ['Pasta', [['Spaghetti vongole', 13.5], ['Lasagne', 12], ['Penne arrabbiata', 10]]],
      ],
    },
  },
  {
    id: 'chips',
    titles: ['Fish & Chips', "{S}'s Fish Bar", 'The Codfather', 'Harbour Fish Bar', 'The Frying Scotsman', 'Salt & Vinegar', 'Oh My Cod', 'Quay Fish & Chips'],
    straps: ['Fried fresh to order', 'Eat in or take away', 'Family run since {Y}', 'Landed this morning'],
    glass: ['Fresh fish daily', 'Cod · Haddock · Plaice', 'Mushy peas · Curry sauce'],
    offers: ['Pensioners special Tues £6.50', 'Gluten-free Mondays', 'Please wait to be served'],
    hours: HOURS.chip,
    faces: [FACE.BLACK, FACE.SCRIPT],
    icon: ICON.fish,
    menu: {
      head: 'Fish bar',
      sections: [
        ['Fish', [['Cod', 8.2], ['Haddock', 8.5], ['Plaice', 8.9], ['Scampi (10)', 7.2], ['Fish cake', 2.8], ['Rock', 7.5]]],
        ['Chips & that', [['Chips', 3.2], ['Large chips', 4.2], ['Mushy peas', 1.6], ['Curry sauce', 1.5], ['Gravy', 1.5], ['Pickled egg', 0.9]]],
        ['Others', [['Sausage', 2.2], ['Battered sausage', 2.6], ['Pie', 3.4], ['Pickled onion', 0.5]]],
      ],
    },
  },
  {
    id: 'toys',
    titles: ['Toy Box', "{S}'s Toys", 'The Rocking Horse', 'Tin Soldier', 'Marbles', 'Tiny Toys'],
    straps: ['Toys, games & models', 'Wooden toys · Jigsaws · Kites', 'For children of all ages'],
    glass: ['Kites · Jigsaws · Model boats', 'Toys & games', 'Pocket money corner'],
    offers: ['Model club Saturday 10am', 'Birthday lists kept', 'Please mind the trains'],
    hours: HOURS.shop,
    faces: [FACE.BLACK, FACE.HAND],
    icon: ICON.bear,
  },
  {
    id: 'wine',
    titles: ['The Wine Bar', 'Corks', 'Vin & Sel', 'The Cellar Door', 'Grape & Grain', '{S} Wine Merchants', 'Bottle Shop'],
    straps: ['Wine · Small plates', 'Wines by the glass', 'Merchants since {Y}'],
    glass: ['Wines by the glass', 'Small plates', 'Tastings on Thursdays'],
    offers: ['Tasting Thursday 7pm', 'Corkage £8', 'Case discount 10%'],
    hours: HOURS.bar,
    faces: [FACE.SERIF_B, FACE.SCRIPT],
    icon: ICON.glass,
    menu: {
      head: 'Tonight',
      sections: [
        ['By the glass', [['Picpoul de Pinet', 6.5], ['Haven Bay Bacchus', 7.5], ['Côtes du Rhône', 6], ['Rioja Crianza', 7], ['Cava', 6.5]]],
        ['Small plates', [['Olives, almonds', 4.5], ['Boquerones', 6], ['Cheese, quince', 9], ['Charcuterie', 11], ['Bread, butter', 3.5]]],
      ],
    },
    chalk: ['Picpoul £6.50', 'Tasting Thursday', 'Small plates till late'],
  },
  {
    id: 'tailor',
    titles: ['{S} Tailors', '{I} {S}, Tailor', 'Needle & Thread', 'The Cutting Room', '{S} & Son', 'Savile on Sea'],
    straps: ['Bespoke tailoring', 'Alterations & repairs', 'Suits made to measure', 'Est. {Y}'],
    glass: ['Alterations · Repairs', 'Made to measure', 'Dry cleaning taken in'],
    offers: ['Trousers shortened £9', 'Wedding hire', 'Zips replaced while you wait'],
    hours: HOURS.shop,
    faces: [FACE.SERIF_B, FACE.SCRIPT],
    icon: ICON.scissors,
  },
  {
    id: 'tearoom',
    titles: ['The Tea Room', "{F}'s Tea Rooms", 'Earl & Grey', 'The Teapot', 'Kettle & Crumb', 'The Tide Table Tea Room'],
    straps: ['Cream teas · Light lunches', 'Loose-leaf teas', 'Homemade cakes & scones'],
    glass: ['Cream teas', 'Light lunches', 'Loose-leaf tea sold here'],
    offers: ['Afternoon tea – please book', 'Scone of the day: cheese & chive', 'Gift vouchers'],
    hours: HOURS.cafe,
    faces: [FACE.SCRIPT, FACE.SERIF_B],
    icon: ICON.cup,
    menu: {
      head: 'Teas',
      sections: [
        ['Pots', [['Tinyhaven Blend', 3], ['Earl Grey', 3.2], ['Darjeeling', 3.4], ['Lapsang Souchong', 3.4], ['Peppermint', 3]]],
        ['Cakes', [['Cream tea', 7.5], ['Victoria sponge', 3.8], ['Coffee & walnut', 3.8], ['Toasted teacake', 2.9]]],
        ['Lunches', [['Welsh rarebit', 7], ['Egg mayonnaise sandwich', 5.5], ['Soup of the day', 5.5]]],
      ],
    },
    chalk: ['Cream tea £7.50', 'Today: lemon drizzle', 'Pots from £3'],
  },
  {
    id: 'grocer',
    titles: ['{S} Greengrocer', "{S}'s Fruit & Veg", 'The Veg Box', 'Market Greens', 'Fresh & Fruity', '{St} Greengrocers', 'Root & Leaf'],
    straps: ['Fruit · Veg · Flowers', 'Fresh from local farms', 'Local produce', 'Family run'],
    glass: ['Fresh every morning', 'Local apples', 'Veg boxes delivered'],
    offers: ['Veg box £12 a week', 'Please do not squeeze', 'English apples now in', 'Eggs from Westbrook'],
    hours: HOURS.early,
    faces: [FACE.BLACK, FACE.HAND],
    icon: ICON.apple,
    chalk: ['Strawberries £3', 'New potatoes', 'Local eggs', 'Cox apples, 2 lb £2'],
  },
  {
    id: 'optician',
    titles: ['{S} Opticians', 'Clear View', 'Haven Optical', 'See Here', '{S} & Partners Optometrists', 'Optics'],
    straps: ['Eye tests · Glasses · Contact lenses', 'Independent opticians', 'Eye care since {Y}'],
    glass: ['Eye tests', 'Frames from £49', 'Second pair half price'],
    offers: ['Book your eye test', 'Repairs while you wait', 'Sunglasses 20% off'],
    hours: HOURS.shop,
    faces: [FACE.HUMAN, FACE.SANS_B],
    icon: ICON.specs,
  },
  {
    id: 'hardware',
    titles: ['{S} Hardware', "{S}'s Ironmongers", 'Nuts & Bolts', 'The Tool Box', '{S} & Son Ironmongery', '{St} Hardware', 'Fork Handles'],
    straps: ['Ironmongers since {Y}', 'Tools · Paint · Keys cut', 'If we have not got it, you do not need it'],
    glass: ['Keys cut · Paint mixed', 'Nails sold by weight', 'Calor gas'],
    offers: ['Keys cut while you wait', 'Paint mixed to match', 'Knives sharpened Thursdays', 'Mouse traps now in'],
    hours: HOURS.shop,
    faces: [FACE.BLACK, FACE.SERIF_B],
    icon: ICON.hammer,
  },
  {
    id: 'patisserie',
    titles: ['Pâtisserie {S}', 'La Belle Tarte', 'Choux', 'Pâtisserie Marine', 'Le Sablé'],
    straps: ['Pâtisserie française', 'Tarts · Éclairs · Macarons', 'Baked at dawn'],
    glass: ['Tartes · Éclairs · Macarons', 'Fresh croissants', 'Gâteaux to order'],
    offers: ['Macarons: box of 6 £9', 'Order your gâteau by Thursday', 'Croissants until they run out'],
    hours: HOURS.early,
    faces: [FACE.SCRIPT, FACE.SERIF_B],
    icon: ICON.cake,
  },
  {
    id: 'antiques',
    titles: ['{S} Antiques', 'Bygones', 'The Old Curiosity', 'Time & Tide Antiques', 'Attic', 'Salvage & Sons'],
    straps: ['Clocks · Silver · Furniture', 'Antiques bought & sold', 'House clearances'],
    glass: ['Antiques bought & sold', 'House clearances', 'Clocks repaired'],
    offers: ['Back in ten minutes', 'Ask about the barometer', 'Valuations on Friday'],
    hours: [W(10, 17, [10, 17], null, 'Mon'), W(10.5, 16.5, [10, 16])],
    faces: [FACE.SERIF_B, FACE.SCRIPT],
    icon: ICON.key,
  },
  {
    id: 'records',
    titles: ['Groove', 'Spin', 'Vinyl Haven', "{S}'s Records", 'Side B', 'Needle Drop'],
    straps: ['New & used vinyl', 'Records bought & sold', 'Turntables serviced'],
    glass: ['New & used vinyl', 'Records bought for cash', 'Listening booth'],
    offers: ['Record fair on the 14th', 'The Gulls LP in stock', 'Staff picks inside'],
    hours: HOURS.shop,
    faces: [FACE.BLACK, FACE.TALL],
    icon: ICON.note,
  },
  {
    id: 'bike',
    titles: ['{S} Cycles', 'Spokes', 'The Bike Shop', 'Chain Reaction', "{F}'s Bikes", 'Haven Cycle Works'],
    straps: ['Sales · Repairs · Hire', 'Bikes since {Y}', 'Hire by the day'],
    glass: ['Puncture repair while you wait', 'Bikes for hire', 'Servicing from £35'],
    offers: ['Hire: £12 a day', 'Winter service £30', 'Second-hand bikes wanted'],
    hours: HOURS.shop,
    faces: [FACE.BLACK, FACE.HUMAN],
    icon: ICON.bike,
  },
  {
    id: 'stationer',
    titles: ['{S} Stationers', 'Paper & Ink', 'The Pen Shop', 'Quill', 'Foolscap'],
    straps: ['Pens · Paper · Cards', 'Stationers since {Y}', 'Greeting cards'],
    glass: ['Fine pens & papers', 'Greeting cards', 'Printing & photocopies'],
    offers: ['Copies 10p', 'School lists – ask inside', 'Passport photos £6'],
    hours: HOURS.shop,
    faces: [FACE.SERIF_B, FACE.SCRIPT],
    icon: ICON.env,
  },
  {
    id: 'gallery',
    titles: ['{St} Gallery', 'The Harbour Gallery', 'Gallery {S}', 'White Wall', 'Tide Line Gallery', 'Gallery'],
    straps: ['Contemporary art & prints', 'Local artists', 'Framing service'],
    glass: ['Now showing: Sea & Sky', 'Paintings · Prints · Ceramics', 'Picture framing'],
    offers: ['Private view on Friday, all welcome', 'Open studios this month', 'Framing while you wait'],
    hours: [W(10, 17, [10, 17], [12, 16], 'Mon')],
    faces: [FACE.HUMAN, FACE.SERIF],
    icon: ICON.frame,
  },
  {
    id: 'pub',
    titles: ['The Anchor', 'The Lighthouse', 'The Ship', 'The Crown & Anchor', 'The Mariners', 'The Harbour Light', 'The Fisherman’s Rest', 'The Old Customs', 'The Plough', 'The Three Tuns', 'The Kittiwake'],
    straps: ['Free house', 'Real ales · Food served daily', 'Rooms · Ales · Quiz night', 'Haven Brewery ales'],
    glass: ['Real ales · Sunday roasts', 'Food served 12 – 9', 'Quiz night Wednesdays', 'Beer garden'],
    offers: ['Quiz Wednesdays 8pm', 'Live music Saturday', 'Darts team wanted', 'Dogs welcome in the bar'],
    hours: HOURS.pub,
    faces: [FACE.SERIF_B, FACE.SCRIPT],
    icon: ICON.pint,
    menu: PUB,
    chalk: ['Sunday roast £16', 'Guest ale: Gull Bitter', 'Quiz tonight 8pm', 'Fish & chips Friday'],
  },
  {
    id: 'shoes',
    titles: ['{S} Shoes', 'Sole Mates', 'Heel & Toe', 'Cobbler', 'Best Foot Forward', '{St} Shoes', 'Well Heeled'],
    straps: ['Shoes for all the family', 'Repairs while you wait', 'Fitted properly'],
    glass: ['Sale now on', 'Shoes repaired', "Children's fitting"],
    offers: ['Sale up to 40% off', 'Heels re-tipped £8', 'School shoes now in'],
    hours: HOURS.shop,
    faces: [FACE.SERIF_B, FACE.BLACK],
    icon: ICON.shoe,
  },
  {
    id: 'hats',
    titles: ['Top Hat', 'The Hat Shop', "{F}'s Hats", 'Mad About Hats', 'Brim'],
    straps: ['Hats for every head', 'Hire & sale', 'Milliners'],
    glass: ['Wedding hats for hire', 'Sun hats · Caps · Trilbies'],
    offers: ['Hat hire £20', 'Ask to try them on'],
    hours: HOURS.shop,
    faces: [FACE.SCRIPT, FACE.SERIF_B],
    icon: ICON.hat,
  },
  {
    id: 'binder',
    titles: ['{S} Bookbinders', 'Bound', 'Spine & Board'],
    straps: ['Hand bookbinding & repair', 'Theses bound', 'Est. {Y}'],
    glass: ['Hand binding & repair', 'Family bibles restored'],
    offers: ['Theses bound in 48 hours', 'Marbled papers sold'],
    hours: HOURS.shop,
    faces: [FACE.SERIF_B, FACE.SERIF],
    icon: ICON.book,
  },
  {
    id: 'post',
    titles: ['Post Office', '{St} Post Office', 'Haven Post Office'],
    straps: ['Stamps · Parcels · Pensions', 'Foreign currency', 'Sub-postmaster {I} {S}'],
    glass: ['Parcels · Stamps · Passports', 'Foreign currency', 'Bill payments'],
    offers: ['Last post 5.30pm', 'Passport check & send', 'Lost: one glove. Ask inside'],
    hours: [W(9, 17.5, [9, 12.5])],
    faces: [FACE.SANS_B, FACE.HUMAN],
    icon: ICON.env,
  },
  {
    id: 'bank',
    titles: ['Haven Bank', 'Harbour Savings Bank', 'First Haven', 'Tinyhaven Building Society', 'Northgate Savings'],
    straps: ['Savings · Mortgages · Loans', 'Founded {Y}', 'Talk to us about your savings'],
    glass: ['Mortgages from 3.9%', 'Cash machine inside', 'Save for a rainy day'],
    offers: ['Rates may go down as well as up', 'Lost card? Call 01632 960 100', 'Your home may be at risk'],
    hours: [W(9.5, 16.5, [9.5, 12.5])],
    faces: [FACE.SERIF_B, FACE.HUMAN],
    icon: ICON.bank,
  },
  {
    id: 'boutique',
    titles: ['Boutique {S}', 'Linen & Salt', 'Thread', 'Mode', 'Clover', 'Marine', 'Atelier {F}', 'The Dress Shop'],
    straps: ["Women's & men's clothing", 'Independent labels', 'New season now in'],
    glass: ['New season', 'Sale', 'Linen · Wool · Knitwear'],
    offers: ['Sale: up to 50% off', 'Alterations on request', 'Gift vouchers'],
    hours: HOURS.shop,
    faces: [FACE.HUMAN, FACE.SERIF],
    icon: ICON.hat,
  },
  {
    id: 'general',
    titles: ['{S} General Stores', '{St} Stores', 'The Corner Shop', "{S}'s Newsagent", 'Quay Stores', 'Open All Hours'],
    straps: ['Groceries · Papers · Off-licence', 'Newsagent & general store', 'Open early, close late'],
    glass: ['Papers · Milk · Bread', 'Off-licence', 'National Lottery'],
    offers: ['Papers delivered', 'Ice creams', 'Cash machine'],
    hours: [W(6.5, 21, [6.5, 21], [8, 18])],
    faces: [FACE.BLACK, FACE.SANS_B],
    icon: ICON.star,
  },
];

const BY_ID = new Map(TRADES.map((t) => [t.id, t]));

/** the shop's word in the building generators (it also picks the room in the window) → its trade */
function tradeOf(word: string): Trade {
  const w = word.toLowerCase();
  const rules: [RegExp, string][] = [
    [/bakery/, 'bakery'], [/pâtisserie/, 'patisserie'], [/café|espresso|coffee/, 'cafe'], [/bookbinder/, 'binder'], [/books/, 'books'], [/florist/, 'florist'], [/deli/, 'deli'], [/cheese/, 'cheese'], [/butcher/, 'butcher'],
    [/chocolate/, 'chocolate'], [/gelato|^ice/, 'gelato'], [/pharmacy/, 'pharmacy'], [/barber/, 'barber'], [/bistro/, 'bistro'], [/pizzeria/, 'pizza'], [/fish/, 'chips'], [/toy/, 'toys'], [/wine/, 'wine'], [/tailor/, 'tailor'],
    [/tea room/, 'tearoom'], [/greengrocer/, 'grocer'], [/optic/, 'optician'], [/hardware/, 'hardware'], [/antiques/, 'antiques'], [/records/, 'records'], [/bike/, 'bike'], [/stationery/, 'stationer'], [/gallery/, 'gallery'],
    [/anchor|pub/, 'pub'], [/shoes/, 'shoes'], [/hat/, 'hats'], [/post/, 'post'], [/bank/, 'bank'], [/boutique/, 'boutique'],
  ];
  for (const [re, id] of rules) if (re.test(w)) return BY_ID.get(id) as Trade;
  return BY_ID.get('general') as Trade;
}

// ──────────────────────────────────────────────────────────── a shop's story ──

export interface Shop {
  trade: string;
  title: string;
  strap: string;
  owner: string;
  year: number;
  phone: string;
  week: Week;
  /** today's hours: the door sign turns when they come round */
  today: [number, number] | null;
  glass: string[];
  offers: string[];
  chalk: string[] | undefined;
  menu: MenuDef | undefined;
  face: Face;
  icon: string;
  seed: number;
}

const made = new Map<string, Shop>();
const titlesUsed = new Set<string>();

/** the shop on this lot, who keeps it. `word` is the generator's shop word ("Bakery"), `street` the address's street. */
export function shopOf(lot: number, word: string, street = 'High Street'): Shop {
  const key = `${lot}:${word}`;
  const hit = made.get(key);
  if (hit) return hit;
  const t = tradeOf(word);
  const seed = hashText(key);
  const r = stream(seed);
  const S = surname(r),
    F = first(r),
    I = initials(r),
    St = street.split(' ')[0],
    Y = int(r, 1887, 2011);
  const fill = (s: string): string => s.replace(/\{S\}/g, S).replace(/\{F\}/g, F).replace(/\{I\}/g, I).replace(/\{St\}/g, St).replace(/\{Y\}/g, String(Y));
  // (no two shops in town of the same name)
  let title = fill(pick(r, t.titles));
  for (let k = 0; k < 8 && titlesUsed.has(title); k++) title = fill(pick(r, t.titles));
  if (titlesUsed.has(title)) title = fill(`${pick(r, ['{S}', '{St}'])} ${t.titles[0].replace(/^.*?\s/, '') || t.id}`);
  titlesUsed.add(title);
  const week = pick(r, t.hours);
  const shop: Shop = {
    trade: t.id,
    title,
    strap: fill(pick(r, t.straps)),
    owner: `${F} ${S}`,
    year: Y,
    phone: phone(r),
    week,
    today: week.sat ? [week.sat[0], week.sat[1]] : null,
    glass: some(r, t.glass, 2).map(fill),
    offers: some(r, t.offers, 3).map(fill),
    chalk: t.chalk ? some(r, t.chalk, 4) : undefined,
    menu: t.menu,
    face: pick(r, t.faces),
    icon: t.icon,
    seed,
  };
  made.set(key, shop);
  return shop;
}

/** £ */
export const price = (v: number): string => (v < 1 ? `${Math.round(v * 100)}p` : `£${v.toFixed(2)}`);

// ──────────────────────────────────────────────────── firms and residents ──

const FIRM_A = ['Meridian', 'Northgate', 'Harbour', 'Lumen', 'Atlas', 'Osprey', 'Castellan', 'Beacon', 'Westbrook', 'Kestrel', 'Tidewater', 'Foundry', 'Quay', 'Halyard', 'Marlin', 'Ashgrove', 'Anchorage', 'Lantern', 'Pier', 'Fathom'];
const FIRM_B = ['Partners', 'Associates', 'Accountants', 'Solicitors', 'Architects', 'Insurance', 'Consulting', 'Surveyors', 'Holdings', 'Shipping Agents', 'Dental Practice', 'Translations', 'Design', 'Recruitment', 'Publishing', 'Estate Agents', 'Marine Brokers'];
const PROFESSION = ['Solicitors', 'Chartered Accountants', 'Architects', 'Notary Public', 'Dentist', 'Physiotherapy', 'Chartered Surveyors', 'Commissioners for Oaths', 'Tax Advisers', 'Psychotherapist'];

export function firm(r: R): string {
  return r() < 0.55 ? `${pick(r, FIRM_A)} ${pick(r, FIRM_B)}` : `${surname(r)} ${pick(r, ['&', '&', 'and'])} ${surname(r)} ${pick(r, PROFESSION)}`;
}
/** the tenants of an office building, top floor first */
export function tenants(seed: number, floors: number): string[] {
  const r = stream(seed);
  const out: string[] = [];
  for (let f = Math.max(1, Math.min(floors, 12)); f >= 1; f--) out.push(`${f}  ${firm(r)}`);
  return out;
}
/** who lives there, as written on the bells */
export function residents(seed: number, n: number): string[] {
  const r = stream(seed);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const u = r();
    out.push(u < 0.5 ? surname(r) : u < 0.8 ? `${surname(r)} / ${surname(r)}` : `${initials(r)} ${surname(r)}`);
  }
  return out;
}
const HOUSE_NAMES = ['Sea View', 'Gull Cottage', 'Fairhaven', 'The Laurels', 'Rose Cottage', 'Tide End', 'Anchor House', 'Windrush', 'Kittiwake', 'The Old Forge', 'Driftwood', 'Harbour View', 'Fern Bank', 'Journey’s End'];
export const houseName = (r: R): string => pick(r, HOUSE_NAMES);
export const familyName = (r: R): string => surname(r);
export const DOOR_NOTES = ['No junk mail please', 'No cold callers', 'Beware of the cat', 'Parcels next door at 14', 'Please knock loudly', 'Mind the step', 'Baby sleeping', 'Deliveries round the back', 'Please shut the gate', 'No free papers, thank you'];

// ─────────────────────────────────────────────────── bills on walls and columns ──

export interface Bill {
  head: string;
  sub: string;
  lines: string[];
  foot: string;
  bg: number;
  ink: number;
  accent: number;
  face: Face;
  form: number;
}

const BILLS: [string, string, string[], string][] = [
  ['SUMMER REGATTA', 'Saturday 14th, from 10am', ['Dinghy races · Rowing · Crab fishing', 'Bandstand from noon', 'Fireworks off the pier at dusk'], 'Haven Rowing Club'],
  ['THE GULLS', 'Live at the Pier Pavilion', ['With special guests The Low Tides', 'Friday 20th · Doors 7.30', 'Tickets £14 from Groove'], 'Over 14s only'],
  ['CIRCUS HAVEN', 'Three nights only', ['On the Beach Road green', 'Clowns · Acrobats · Fire eaters', 'Nightly 7pm, Saturday matinée 2pm'], 'Children half price'],
  ['FISH MARKET', 'Every Friday on the quay', ['Landed this morning', '6am until sold out', 'Crab · Mackerel · Sole · Oysters'], 'Haven Fishermen’s Co-operative'],
  ['MIDNIGHT FILM', 'At the Royal Cinema', ['The Long Tide (PG)', 'Saturdays at 11.45pm', 'Popcorn · Bar open late'], 'The Royal, King Street'],
  ['HARBOUR JAZZ', 'Festival weekend', ['Twelve bands, five stages', 'Quay Street closed to traffic', 'Free entry before 6pm'], 'Supported by Haven Bank'],
  ['ORGAN RECITAL', 'Town Hall, Sunday 3pm', ['Bach, Widor and Messiaen', 'Dr A. Trevena at the console', 'Retiring collection'], 'Friends of the Town Hall Organ'],
  ['DERBY DAY', 'Haven FC v Westbrook', ['Saturday, kick-off 3pm', 'Haven Park', 'Adults £12 · Under 16s £4'], 'Up the Gulls!'],
  ['FLEA MARKET', 'Sunday, Market Square', ['Stalls from 8am', 'Bric-a-brac · Records · Books', 'Pitches £10, ring 01632 960 144'], 'In aid of the lifeboat'],
  ['LIFEBOAT DAY', 'Open day at the slipway', ['Launch at 2pm, tide allowing', 'Tea and cakes on the quay', 'Please give generously'], 'Tinyhaven Lifeboat Station'],
  ['THE TEMPEST', 'Haven Players', ['Westbrook School Hall', '12th–15th at 7.30', 'Tickets £8 / £5'], 'Box office at Harbour Books'],
  ['BEER FESTIVAL', 'The Old Customs Warehouse', ['Sixty ales, twenty ciders', 'Thursday to Saturday', 'Live folk every evening'], 'Entry £5, glass included'],
  ['KITE DAY', 'Beach Road, this Sunday', ['Bring your own or make one', 'Wind permitting', 'From 11am'], 'Tiny Toys & the Sea Scouts'],
  ['SAVE OUR PIER', 'Public meeting', ['Town Hall, Tuesday 7pm', 'The council will attend', 'Everyone welcome'], 'Friends of the Pier'],
  ['CAR BOOT SALE', 'Station car park', ['Every Sunday 7am – 1pm', 'Sellers £8', 'No dealers before 7'], 'Rotary Club of Tinyhaven'],
  ['CEILIDH', 'Rowing Club, Saturday 8pm', ['The Quay Street Band', 'All dances called', 'Bar · Tickets £10'], 'Beginners very welcome'],
  ['OPEN STUDIOS', 'Artists of the Old Town', ['Forty studios, two weekends', 'Free map from any gallery', '11am – 5pm'], 'Haven Arts Trust'],
  ['BLOOD DONORS', 'Please give, Church Hall', ['Thursday 1.30 – 7pm', 'Walk in or book', 'Biscuits provided'], 'Give blood, save lives'],
];
const BILL_COL: [number, number, number][] = [
  [0x14305a, 0xf2c230, 0xf4f1e6], [0xc2283c, 0xf4f1e6, 0x14141a], [0xe0a020, 0x14141a, 0xb8322c], [0x227a6a, 0xf4f1e6, 0xf2d88c], [0x16161c, 0xe8574f, 0xf4f1e6], [0x7a2f8f, 0xf2d88c, 0xf4f1e6],
  [0xece6d4, 0x1d3557, 0xb8322c], [0x1d6f3a, 0xffffff, 0xf2d88c], [0xf4efe2, 0x2b2b2b, 0xd62f2f], [0x2a2f36, 0xf2f0e8, 0x7fb8d8], [0xf2d24a, 0x1a1a1e, 0xc2283c], [0xdf6b3a, 0x1c1c22, 0xf8efe0],
];

export function billOf(seed: number): Bill {
  const r = stream(seed + 77);
  const [head, sub, lines, foot] = pick(r, BILLS);
  const [bg, ink, accent] = pick(r, BILL_COL);
  return { head, sub, lines, foot, bg, ink, accent, face: pick(r, [FACE.BLACK, FACE.TALL, FACE.TALL, FACE.SERIF_B]), form: int(r, 0, 3) };
}

// ─────────────────────────────────────────────────── notices from the neighbours ──

export interface Notice {
  head: string;
  lines: string[];
  tabs?: string;
  paper: number;
  face: Face;
  cat?: boolean;
}

export function noticeOf(seed: number): Notice {
  const r = stream(seed + 991);
  const tel = `01632 96${int(r, 0, 9)} ${int(r, 100, 999)}`;
  const S = surname(r);
  const F = first(r);
  const cat = pick(r, ['Biscuit', 'Mackerel', 'Mr Tibbs', 'Pepper', 'Sailor', 'Duchess', 'Otto', 'Smudge', 'Admiral']);
  const street = pick(r, ['Mill Lane', 'Church Street', 'Elm Road', 'King Street', 'Quay Street', 'Market Street', 'Park Avenue']);
  const kinds: Notice[] = [
    { head: 'LOST CAT', lines: [`${cat} has not been home since Tuesday.`, `Grey tabby, white paws, very friendly, last seen on ${street}.`, 'Please check your sheds and garages.', `Reward. Ring ${F} on ${tel}`], paper: 0xf4f1e6, face: FACE.BLACK, cat: true },
    { head: 'ROOM TO LET', lines: [`Sunny double room over ${street}.`, 'Shared kitchen and bath. Sea view if you lean out.', '£110 a week, bills included. No smokers.'], tabs: tel, paper: 0xf2e49a, face: FACE.SANS_B },
    { head: 'YOGA', lines: ['Mondays 6.30pm, Church Hall.', 'All ages and abilities. Bring a mat.', `£6 a class. Ask for ${F}.`], tabs: tel, paper: 0xcde4f2, face: FACE.HAND },
    { head: 'GUITAR LESSONS', lines: ['Beginners and improvers, all ages.', `${F} ${S}, 20 years' experience.`, 'First lesson free.'], tabs: tel, paper: 0xf4f1e6, face: FACE.BLACK },
    { head: 'BAND NIGHT', lines: ['Three local bands at The Anchor.', 'Saturday from 8pm, £4 on the door.', 'Bring your ears.'], paper: 0xf4c8c0, face: FACE.TALL },
    { head: 'FOR SALE', lines: ['Dinghy, 11 ft, needs some work.', 'Comes with oars and a trailer of sorts.', '£250 or near offer.'], tabs: tel, paper: 0xf4f1e6, face: FACE.SANS_B },
    { head: 'MOVING?', lines: [`${S} Removals. Man with a van.`, 'Local and long distance. Cheap and careful.', 'No job too small.'], tabs: tel, paper: 0xf2e49a, face: FACE.BLACK },
    { head: 'FOUND', lines: [`Bunch of keys with a blue fob, ${street}.`, 'Handed in at the Post Office.', 'Ask at the counter.'], paper: 0xf4f1e6, face: FACE.SANS_B },
    { head: 'CHOIR', lines: ['Tinyhaven Community Choir needs tenors.', 'Thursdays 7.30, Westbrook School.', 'You do not need to read music.'], tabs: tel, paper: 0xd9efc7, face: FACE.SERIF_B },
    { head: 'FLEA MARKET', lines: ['Sunday, Market Square, 8 till 2.', 'Tables £10, proceeds to the lifeboat.'], paper: 0xf4c8c0, face: FACE.BLACK },
    { head: 'DOG WALKER', lines: ['Reliable, insured, loves dogs.', `Twice a day along the beach. ${F}, age 17.`, '£8 a walk.'], tabs: tel, paper: 0xcde4f2, face: FACE.HAND },
    { head: 'BABYSITTER', lines: ['Experienced, references available.', `Evenings and weekends. ${F}, ${street}.`], tabs: tel, paper: 0xf7d9e4, face: FACE.HAND },
    { head: 'PIANO', lines: ['Free to a good home.', 'You move it. It is on the second floor.', 'Slightly flat.'], tabs: tel, paper: 0xf4f1e6, face: FACE.SERIF_B },
    { head: 'FRENCH LESSONS', lines: ['Native speaker, all levels.', 'Conversation over coffee if you like.'], tabs: tel, paper: 0xf4f1e6, face: FACE.SERIF_B },
    { head: 'WINDOW CLEANER', lines: [`${S} & Son. Round now free on ${street}.`, 'Every four weeks. Ladders insured.'], tabs: tel, paper: 0xf2e49a, face: FACE.SANS_B },
    { head: 'SEEN THIS BIKE?', lines: [`Green Haven Cycle Works, stolen from ${street}.`, 'Basket on the front, bell does not work.', 'No questions asked.'], tabs: tel, paper: 0xf4f1e6, face: FACE.BLACK },
    { head: 'JUMBLE SALE', lines: ['St Peter’s Hall, Saturday 2pm.', 'Entry 20p. Teas.', 'Donations welcome on Friday.'], paper: 0xd9efc7, face: FACE.HAND },
    { head: 'ROAD CLOSED', lines: [`${street} closed Sunday 8am – 4pm for the street party.`, 'By order of Tinyhaven Borough Council.'], paper: 0xf6f3ea, face: FACE.SANS_B },
    { head: 'PLANNING NOTICE', lines: [`Town and Country Planning Act. Application 26/0${int(r, 100, 999)}.`, `Change of use at ${int(r, 2, 88)} ${street} to a dwelling.`, 'Comments to the Town Hall within 21 days.'], paper: 0xfbf7c8, face: FACE.SANS_B },
  ];
  return pick(r, kinds);
}

// ──────────────────────────────────────────────────────────── the paper ──

const HEADLINES = [
  'FERRY LATE AGAIN', 'COUNCIL BACKS NEW PIER', 'GULLS STEAL CHIPS, SAYS MAYOR', 'BUMPER CATCH AT HARBOUR', 'HAVEN FC FIVE-GOAL THRILLER', 'RAIL LINE TO REOPEN', 'TOWN HALL CLOCK STOPS', 'FIREWORKS SATURDAY: WHERE TO WATCH',
  'LIFEBOAT CREW SAVE TWO', 'MARKET TRADERS IN PARKING ROW', 'SEA WALL REPAIRS TO START', 'WHO STOLE THE HARBOUR BELL?', 'RECORD CROWD AT REGATTA', 'NEW BUS TIMES FROM MONDAY', 'HOUSE PRICES UP ON QUAY STREET', 'BAKER, 91, HANGS UP APRON',
];
const STANDFIRST = [
  'Councillors voted seven to four last night after a long and at times heated meeting at the Town Hall.',
  'Residents say the problem has been getting worse for years, and that nobody at the Town Hall will listen.',
  'The harbour master said he had seen nothing like it in thirty years on the quay.',
  'Hundreds lined the promenade on Saturday in the best weather the town has had all year.',
];
const BODY = [
  'A spokesman for the borough council said the matter was under review and that a report would follow in due course.',
  'Local traders have welcomed the news, although some fear the work will drive away visitors during the season.',
  'Mrs Pascoe, who has lived on Mill Lane for over fifty years, said she had never known anything like it.',
  'The next meeting of the committee will take place at the Town Hall on the first Tuesday of the month.',
  'Police are asking anyone with information to come forward, and have thanked the public for their patience.',
  'Work is expected to take six weeks, weather permitting, and there will be some disruption to traffic on Harbour Road.',
  'Tickets are available from the Post Office and from Harbour Books, and are expected to sell quickly.',
  'A collection among the regulars at The Anchor raised more than four hundred pounds in a single evening.',
  'The tide table for the coming week and the full list of sailings can be found on page twelve.',
  'Mr Trevena told the Post that he was disappointed by the decision but that the fight was far from over.',
];
const PAPERS = ['HAVEN POST', 'THE TINYHAVEN TIMES', 'HARBOUR GAZETTE', 'THE COASTAL CHRONICLE', 'EVENING ECHO'];

export interface Paper {
  masthead: string;
  headline: string;
  stand: string;
  body: string[];
  price: string;
  date: string;
  serif: boolean;
}

export function paperOf(seed: number): Paper {
  const r = stream(seed + 31);
  return {
    masthead: pick(r, PAPERS),
    headline: pick(r, HEADLINES),
    stand: pick(r, STANDFIRST),
    body: some(r, BODY, 6),
    price: pick(r, ['90p', '£1.10', '80p', '£1.20']),
    date: 'Saturday 31 October',
    serif: r() < 0.6,
  };
}
/** the placard by a newsagent's door */
export const placard = (seed: number): [string, string] => {
  const r = stream(seed + 5);
  return pick(r, [
    ['FERRY', 'LATE AGAIN'], ['PIER', 'VOTE: IT’S YES'], ['DERBY', 'DAY DRAMA'], ['WHO STOLE', 'THE BELL?'], ['FIREWORKS', 'SATURDAY'], ['NEW BUS', 'TIMES'], ['GULLS', 'SHOCK'], ['MAYOR', 'SPEAKS OUT'],
  ]);
};

// ───────────────────────────────────────────────────────── small municipal things ──

const IN_MEMORY = [
  ['In loving memory of', '{F} {S}', 'who loved this view'],
  ['For {F}', 'always by the sea', ''],
  ['{F} & {G} {S}', 'They sat here every Sunday', ''],
  ['In memory of {F} {S}', '{Y} – {Z}', 'Harbour pilot'],
  ['Sit a while', 'Remembering {F}', ''],
  ['Given by the Rotary Club', 'of Tinyhaven', '{Z}'],
  ['{F} {S}', 'Teacher, gardener, friend', '{Y} – {Z}'],
  ['Presented by the', 'Friends of the Park', '{Z}'],
];
const FAMED = ['Harbour pilot', 'Lifeboat coxswain', 'Chart maker', 'Botanist', 'Novelist', 'Lighthouse engineer', 'Composer', 'Pioneer of the steam ferry', 'Physician to the poor', 'Marine painter', 'Astronomer', 'Founder of the town library', 'Suffragist', 'Bridge builder'];
/** a round blue plaque on an old house: who lived here */
export function heritageOf(seed: number): { name: string; years: string; did: string; lived: string } {
  const r = stream(seed + 773);
  const born = int(r, 1760, 1890);
  return { name: `${first(r)} ${surname(r)}`, years: `${born} – ${born + int(r, 48, 88)}`, did: pick(r, FAMED), lived: pick(r, ['lived here', 'was born here', 'worked here', 'lodged here']) };
}

export function plaqueOf(seed: number): string[] {
  const r = stream(seed + 411);
  const F = first(r),
    G = first(r),
    S = surname(r),
    Y = int(r, 1921, 1950),
    Z = int(r, 1994, 2024);
  return pick(r, IN_MEMORY).map((l) => l.replace('{F}', F).replace('{G}', G).replace('{S}', S).replace('{Y}', String(Y)).replace('{Z}', String(Z)));
}

export const COUNCIL = 'Tinyhaven Borough Council';
