/** The skill ladder. Word lists live in words-*.txt; this file owns the order, lessons and helpers. */
export interface Word { w: string; emoji?: string; sentence: string }
export interface RungDef {
  id: string;
  zone: number;
  /** Short name a child hears and sees. */
  kid: string;
  /** Description for grown-ups. */
  title: string;
  icon: string;
  /** Spoken (and shown) by Robo the first time a child reaches this rung. Written to be safe for text-to-speech. */
  lesson: string;
  /** Example words; [brackets] mark the pattern, "a>b" shows a change. */
  examples: string[];
  /** Letters that make good wrong choices for this pattern. */
  decoys: string;
  /** One letter = one sound here, so tapping a letter can play its sound. */
  sounds?: boolean;
  /** Extra empty boxes so the number of boxes does not give the answer away. */
  pad?: number;
}
export interface Rung extends RungDef { index: number; words: string[] }
export interface Ladder { rungs: Rung[]; words: Record<string, Word> }

export const ZONES = [
  { name: 'Sound Garden', icon: '🌻', color: '#7ccf8f' },
  { name: 'Blend Bay', icon: '🌊', color: '#5fb4e8' },
  { name: 'Magic E Mountain', icon: '⛰️', color: '#b98be8' },
  { name: 'Vowel Team Valley', icon: '🌈', color: '#f2a65a' },
  { name: 'Tricky Forest', icon: '🌲', color: '#4fb39f' },
  { name: 'Builder City', icon: '🏗️', color: '#e87f8f' },
  { name: 'Wizard Tower', icon: '🏰', color: '#6f86e8' },
];

export const RUNG_DEFS: RungDef[] = [
  { id: 'cvc-aio', zone: 0, kid: 'Middle sounds', title: 'Short a, i, o (cat, pig, hop)', icon: '🐱', sounds: true, decoys: 'aioeu',
    lesson: 'Every little word has a sound hiding in the middle. Listen. Cat. Pig. Hop. Let’s catch every sound!', examples: ['c[a]t', 'p[i]g', 'h[o]p'] },
  { id: 'cvc-eu', zone: 0, kid: 'More middle sounds', title: 'Short e, u (bed, sun)', icon: '☀️', sounds: true, decoys: 'euaio',
    lesson: 'Two more middle sounds! Listen. Bed. Sun. Can you hear them?', examples: ['b[e]d', 's[u]n', 'h[e]n'] },
  { id: 'digraphs', zone: 0, kid: 'Letter best friends', title: 'sh, ch, th (ship, chin, thin)', icon: '🚢', decoys: 'shctje',
    lesson: 'Some letters are best friends. Together they make one new sound. Ship. Chin. Thin.', examples: ['[sh]ip', '[ch]in', 'ba[th]'] },
  { id: 'floss-ck', zone: 0, kid: 'Twin letters', title: 'ck, ff, ll, ss (duck, bell, miss)', icon: '🦆', decoys: 'cklsfz',
    lesson: 'After a short vowel, some letters bring a twin. Bell. Miss. Puff. And at the end of duck, the letters C and K team up.', examples: ['du[ck]', 'be[ll]', 'mi[ss]'] },

  { id: 'blends-start', zone: 1, kid: 'Zoom starts', title: 'Blends at the start (frog, flag)', icon: '🐸', sounds: true, decoys: 'rlstpc',
    lesson: 'Two sounds can zoom together at the start of a word. Frog. Flag. Stop. Listen for both of them.', examples: ['[fr]og', '[fl]ag', '[st]op'] },
  { id: 'blends-end', zone: 1, kid: 'Squishy ends', title: 'Blends at the end (nest, milk)', icon: '🪺', sounds: true, decoys: 'stlmnpd',
    lesson: 'Now two sounds squish together at the end. Nest. Milk. Jump. Catch them both!', examples: ['ne[st]', 'mi[lk]', 'ju[mp]'] },
  { id: 'blends-5', zone: 1, kid: 'Big five', title: 'Five-letter short-vowel words (plant, brush)', icon: '🪴', decoys: 'rlstnhc',
    lesson: 'Time for big five letter words! Stretch the word out like bubble gum, and catch every single sound.', examples: ['[pl]a[nt]', '[br]u[sh]', '[st]a[mp]'] },
  { id: 'ng-nk', zone: 1, kid: 'Sing and honk', title: 'ng and nk (ring, pink)', icon: '💍', decoys: 'ngkcm',
    lesson: 'The letters N and G sing together. Ring. Song. The letters N and K honk together. Pink. Honk!', examples: ['ri[ng]', 'so[ng]', 'pi[nk]'] },

  { id: 'ee', zone: 2, kid: 'Double E', title: 'Long e spelled ee (tree, feet)', icon: '🌳', decoys: 'eaiy',
    lesson: 'When two letter E’s sit side by side, they say their own name. Tree. Feet. Green.', examples: ['tr[ee]', 'f[ee]t', 'gr[ee]n'] },
  { id: 'magic-a', zone: 2, kid: 'Magic E', title: 'Silent e with a (cap → cape)', icon: '🪄', decoys: 'eaiky',
    lesson: 'Meet Magic E! It sits at the end of a word and stays super quiet. But it makes the other vowel say its name. Cap turns into cape! Tap turns into tape!', examples: ['cap>cap[e]', 'tap>tap[e]', 'mad>mad[e]'] },
  { id: 'magic-ioe', zone: 2, kid: 'More Magic E', title: 'Silent e with i, o, u (kite, hope, cube)', icon: '🪁', decoys: 'eiouy',
    lesson: 'Magic E has more tricks! Kit turns into kite. Hop turns into hope. Cub turns into cube.', examples: ['kit>kit[e]', 'hop>hop[e]', 'cub>cub[e]'] },
  { id: 'magic-mix', zone: 2, kid: 'Magic or not?', title: 'Short vowel or silent e? (hop / hope)', icon: '🎩', decoys: 'eaiou', pad: 1,
    lesson: 'Tricky time! Some words need Magic E, and some do not. Listen closely. Does the vowel say its name?', examples: ['pin', 'pin[e]', 'hop', 'hop[e]'] },

  { id: 'ai-ay', zone: 3, kid: 'Rainy day', title: 'Long a: ai and ay (rain, play)', icon: '🌧️', decoys: 'aiyee',
    lesson: 'Here are two ways to spell the long A sound. In the middle of a word, like rain, it is A I. At the end of a word, like play, it is A Y.', examples: ['r[ai]n', 'tr[ai]n', 'pl[ay]'] },
  { id: 'oa-ow', zone: 3, kid: 'Snowy boat', title: 'Long o: oa and ow (boat, snow)', icon: '⛵', decoys: 'oawe',
    lesson: 'Here are two ways to spell the long O sound. In the middle, like boat, it is O A. At the end, like snow, it is O W.', examples: ['b[oa]t', 's[oa]p', 'sn[ow]'] },
  { id: 'ea-ee', zone: 3, kid: 'Dream team', title: 'Long e: ea or ee (dream, sweet)', icon: '🍑', decoys: 'eaeiy',
    lesson: 'The letters E and A can say the long E sound too. Dream. Beach. Leaf. Your brain has to remember which words use E A, and which use double E.', examples: ['dr[ea]m', 'b[ea]ch', 'sw[ee]t'] },
  { id: 'igh-y', zone: 3, kid: 'Night sky', title: 'Long i: igh and y (night, fly)', icon: '🌙', decoys: 'ighyie',
    lesson: 'Three letters, one sound! I G H says the long I sound. Night. Light. And at the end of a little word, the letter Y says it too. My. Fly. Sky.', examples: ['n[igh]t', 'l[igh]t', 'fl[y]'] },
  { id: 'oo-ew', zone: 3, kid: 'Moon zoom', title: 'oo and ew (moon, book, grew)', icon: '🚀', decoys: 'oewu',
    lesson: 'Double O can sound like moon, or like book. And at the end of a word, E W makes the moon sound too. New. Grew. Flew.', examples: ['m[oo]n', 'b[oo]k', 'gr[ew]'] },

  { id: 'ar-or', zone: 4, kid: 'Bossy R', title: 'ar and or (star, fork)', icon: '⭐', decoys: 'aroeu',
    lesson: 'Bossy R changes the vowel sound! Star. Farm. That is A R. Fork. Storm. That is O R.', examples: ['st[ar]', 'f[ar]m', 'f[or]k'] },
  { id: 'er-ir-ur', zone: 4, kid: 'Three for one', title: 'er, ir, ur (her, bird, turn)', icon: '🐦', decoys: 'eiura',
    lesson: 'Three spellings, one sound! Her. Bird. Turn. Take a picture of each word with your brain.', examples: ['h[er]', 'b[ir]d', 't[ur]n'] },
  { id: 'ou-ow-oi-oy', zone: 4, kid: 'Ow and oy', title: 'ou, ow, oi, oy (cloud, brown, coin, toy)', icon: '☁️', decoys: 'ouwiy',
    lesson: 'Ouch! Cloud and brown have the same sound, with two spellings. And coin and toy share a sound too. O I in the middle. O Y at the end.', examples: ['cl[ou]d', 'br[ow]n', 'c[oi]n', 't[oy]'] },
  { id: 'soft-c-g', zone: 4, kid: 'Soft sounds', title: 'Soft c and g, -dge, -tch (city, cage, bridge, catch)', icon: '🌉', decoys: 'csgjdt',
    lesson: 'The letters C and G go soft before E, I, and Y. City. Ice. Cage. Giant. And right after a short vowel, you will see bridge and catch.', examples: ['[c]ity', 'ca[ge]', 'bri[dge]', 'ca[tch]'] },
  { id: 'silent', zone: 4, kid: 'Ninja letters', title: 'Silent letters: kn, wr, mb, wh (knee, write, lamb)', icon: '🥷', decoys: 'kwbhnr',
    lesson: 'Shh! Some letters are ninjas. They hide in a word and make no sound at all. The K in knee. The W in write. The B in lamb.', examples: ['[k]nee', '[w]rite', 'lam[b]'] },

  { id: 'two-syll', zone: 5, kid: 'Chunk it', title: 'Two-syllable words (rabbit, picnic, apple)', icon: '🐰', decoys: 'eaiolt',
    lesson: 'Long words are just little chunks stuck together. Clap it out. Rab. Bit. Rabbit! Spell one chunk at a time.', examples: ['rab·bit', 'pic·nic', 'ap·ple'] },
  { id: 'endings', zone: 5, kid: 'Add an ending', title: 'Endings with no change: -s, -es, -ed, -ing', icon: '📦', decoys: 'esdtz', pad: 1,
    lesson: 'You can add an ending, and the first part of the word stays just the same. Jump. Jumped. Jumping. Box. Boxes.', examples: ['jump[ed]', 'jump[ing]', 'box[es]'] },
  { id: 'doubling', zone: 5, kid: 'Double up', title: 'Double the last letter (hop → hopping)', icon: '🐇', decoys: 'eaitpn', pad: 1,
    lesson: 'When a short word ends with one vowel and one consonant, double the last letter before you add the ending. Hop. Hopping. Big. Bigger.', examples: ['hop>ho[pp]ing', 'big>bi[gg]er', 'sun>su[nn]y'] },
  { id: 'drop-e', zone: 5, kid: 'Bye bye E', title: 'Drop the e (hope → hoping)', icon: '👋', decoys: 'eaipkm', pad: 1,
    lesson: 'When a word ends with a silent E, the E says bye bye before an ending like I N G or E D. Hope. Hoping. Smile. Smiled.', examples: ['hope>hop[ing]', 'make>mak[ing]', 'smile>smil[ed]'] },
  { id: 'y-to-i', zone: 5, kid: 'Y turns to I', title: 'Change y to i (cry → cried)', icon: '👶', decoys: 'yieea', pad: 1,
    lesson: 'When a word ends with a consonant and the letter Y, the Y changes into an I before the ending. Cry. Cried. Baby. Babies. Happy. Happiest.', examples: ['cry>cr[i]ed', 'baby>bab[i]es', 'happy>happ[i]est'] },
  { id: 'prefixes', zone: 5, kid: 'Front snaps', title: 'Prefixes: un-, re-, dis-, mis-, pre-', icon: '🧩', decoys: 'unrdesi',
    lesson: 'A prefix snaps onto the front of a word and changes what it means. Unhappy means not happy. Replay means play again. The rest of the word keeps its spelling.', examples: ['[un]happy', '[re]play', '[dis]like'] },
  { id: 'suffixes', zone: 5, kid: 'End snaps', title: 'Suffixes: -ful, -less, -ness, -ly, -ment', icon: '🧲', decoys: 'lsnyfe',
    lesson: 'A suffix snaps onto the end of a word. Helpful means full of help, and it has just one L at the end. Fearless means without fear. The first part keeps its spelling.', examples: ['help[ful]', 'fear[less]', 'kind[ness]'] },

  { id: 'homophones', zone: 6, kid: 'Sound-alikes', title: 'Homophones (sea / see)', icon: '👯', decoys: 'eaiouwh', pad: 1,
    lesson: 'Some words sound exactly the same, but they are spelled differently. Listen to my sentence to know which one I mean.', examples: ['s[ea]', 's[ee]', 'h[ear]', 'h[ere]'] },
  { id: 'tion-ture', zone: 6, kid: 'Shun and cher', title: '-tion, -sion, -ture (station, picture)', icon: '🚉', decoys: 'tsiocnuh',
    lesson: 'Listen to the end of station. That shun sound is almost always spelled T I O N. And the end of picture is spelled T U R E.', examples: ['sta[tion]', 'ac[tion]', 'pic[ture]'] },
  { id: 'tricky', zone: 6, kid: 'Rule breakers', title: 'Tricky words (because, friend, thought)', icon: '🧙', decoys: 'eaiouhgw',
    lesson: 'These words break the rules! Even grown ups had to practice them. Take a picture of each one with your brain.', examples: ['s[ai]d', 'fr[ie]nd', 'th[ough]t'] },
];

/** Parse "## rung-id" sections of "word | emoji | sentence" lines. */
export function parseWords(text: string): { rung: string; word: Word }[] {
  const out: { rung: string; word: Word }[] = [];
  let rung = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('##')) { rung = line.replace(/^#+\s*/, '').replace(/`/g, '').trim(); continue; }
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3 || !rung) continue;
    const w = parts[0].toLowerCase();
    if (!/^[a-z]+$/.test(w)) continue;
    out.push({ rung, word: { w, emoji: parts[1] || undefined, sentence: parts.slice(2).join(' ') } });
  }
  return out;
}

/** A word that shows up in two rungs keeps the first sentence and picture, so it has one recording. */
export function buildLadder(texts: string[]): Ladder {
  const words: Record<string, Word> = {};
  const byRung: Record<string, string[]> = {};
  for (const { rung, word } of texts.flatMap(parseWords)) {
    if (!words[word.w]) words[word.w] = word;
    const list = (byRung[rung] ??= []);
    if (!list.includes(word.w)) list.push(word.w);
  }
  const rungs = RUNG_DEFS.map((def, index) => ({ ...def, index, words: byRung[def.id] ?? [] }));
  return { rungs, words };
}

/** Robo's lines. Keys ending in _N are picked at random. */
export const LINES: Record<string, string> = {
  hello: 'Hi! I’m Robo. Who is playing today?',
  warmup_intro: 'Let’s warm up my circuits! Spell some words so I can find the perfect level for you. It is okay if some are tricky.',
  warmup_done: 'Beep boop! Now I know just where to start.',
  start_1: 'Mission time! Let’s power up.',
  start_2: 'Ready, set, spell!',
  start_3: 'My battery is full. Let’s go!',
  start_4: 'New mission! I saved the best words for you.',
  praise_1: 'Woo hoo! You did it!',
  praise_2: 'Zap! Perfect!',
  praise_3: 'Beep beep, hooray!',
  praise_4: 'You are a spelling star!',
  praise_5: 'Wow, wow, wow!',
  praise_6: 'Boom! Nailed it!',
  praise_7: 'My circuits are dancing!',
  praise_8: 'That was super!',
  praise_9: 'High five! Clank!',
  praise_10: 'Yes! Just right!',
  praise_11: 'Robo-tastic!',
  praise_12: 'You make my antenna wiggle!',
  good_1: 'You got there! Nice work.',
  good_2: 'We did it together!',
  good_3: 'That one was tricky, and you stuck with it!',
  good_4: 'Good fixing!',
  good_5: 'Nice try, and nice finish!',
  oops_1: 'Almost! Try again.',
  oops_2: 'Hmm, not quite. Listen one more time.',
  oops_3: 'So close! Fix the wobbly letters.',
  oops_4: 'Oopsie doodle! Give it another go.',
  oops_5: 'My sensors say, try once more.',
  oops_6: 'Not yet. You can do it!',
  show: 'Let’s look at it together. Now you build it.',
  hint: 'Here is a letter to help.',
  done_1: 'Mission complete! Look at all those stars!',
  done_2: 'You finished the mission! I am doing my happy dance.',
  done_3: 'All done! You powered me all the way up.',
  boss_intro: 'Boss round! Five new words, and no hints this time. Show me what you know!',
  boss_win: 'You beat the boss! A new world is open!',
  boss_retry: 'The boss was tough today. Let’s practice a little more, and then try again.',
  level_down: 'Let’s power up with some easier words first. We will come back even stronger.',
  new_gear: 'You unlocked something new for me to wear!',
  tickle_1: 'Hee hee! That tickles!',
  tickle_2: 'Boop!',
  tickle_3: 'Bzzt! Do it again!',
  tickle_4: 'I am so ticklish!',
  wizard: 'You finished every world! You are a true word wizard.',
  gift: 'Surprise! I have a joke for you.',
  gift_color: 'And look! You unlocked a new color for me!',
  team_intro: 'Team mission! Take turns, and fill the rocket together.',
  team_win: 'Team work! Three, two, one. Blast off!',
  team_low: 'So close! The rocket needs a little more fuel. Try again together!',
  // Name-free on purpose: the player's name is shown on screen, and no recording depends on it.
  turn: 'It is your turn!',
};

export function lineIds(prefix: string): string[] {
  return Object.keys(LINES).filter(k => k === prefix || k.startsWith(prefix + '_'));
}
