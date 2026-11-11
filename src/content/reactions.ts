/** What Robo does when a word is spelled: a move, a shower of little pictures, or both. */
export type Act = 'hop' | 'spin' | 'flip' | 'shake' | 'sleep' | 'zoom' | 'fly' | 'grow' | 'shrink' | 'hide' | 'wave' | 'slow' | 'glow' | 'kick';
export interface Reaction { act?: Act; shower?: string }

const GROUPS: [Reaction, string][] = [
  [{ act: 'hop' }, 'hop hopping jump jumped jumping skip bounce'],
  [{ act: 'spin' }, 'spin twirl turn round circle dizzy'],
  [{ act: 'flip' }, 'flip crash'],
  [{ act: 'shake', shower: '🎶' }, 'dance dancing'],
  [{ act: 'shake' }, 'shake wiggle buzz'],
  [{ act: 'shake', shower: '😂' }, 'laugh funny giggle silly'],
  [{ act: 'sleep', shower: '💤' }, 'sleep sleeping bed nap dream'],
  [{ act: 'zoom' }, 'running race speed quickly jet zip fast'],
  [{ act: 'fly' }, 'fly flies flight float kite plane high sky rocket'],
  [{ act: 'grow' }, 'bigger grow grew giant large big huge'],
  [{ act: 'shrink' }, 'little thin thinner small tiny whisper'],
  [{ act: 'hide' }, 'shy hide hiding'],
  [{ act: 'wave' }, 'wave waved clap clapped'],
  [{ act: 'slow' }, 'slow slowly stop'],
  [{ act: 'kick' }, 'kick kicked dig digging'],
  [{ act: 'glow', shower: '✨' }, 'glow shining shiny bright light flash blink wish star'],
  [{ act: 'hop', shower: '😊' }, 'smile smiled happiest happiness'],
  [{ shower: '💧' }, 'cry cried rain rained wet wettest drip swim swimming pool sea melt'],
  [{ act: 'shake', shower: '⛈️' }, 'storm'],
  [{ shower: '❤️' }, 'kiss hug hugged love'],
  [{ shower: '🎵' }, 'sing singing song drum tune flute ring bell chirp honk beep'],
  [{ shower: '❄️' }, 'snow ice cool'],
  [{ shower: '🔥' }, 'hottest flame burn heat'],
  [{ shower: '☀️' }, 'sun sunny'],
  [{ shower: '🌙' }, 'night moon dark'],
  [{ shower: '💨' }, 'blow blew'],
  [{ act: 'shake', shower: '📣' }, 'loudly shout noise'],
];
const BY_WORD: Record<string, Reaction> = {};
for (const [reaction, words] of GROUPS) for (const w of words.split(' ')) BY_WORD[w] = reaction;

/** Words without a special move still shower their own picture, if they have one. */
export function reactionFor(word: string, emoji?: string): Reaction {
  const r = BY_WORD[word];
  return { act: r?.act, shower: r?.shower ?? emoji };
}

export const JOKES: [string, string][] = [
  ['What is a robot’s favorite snack?', 'Computer chips!'],
  ['What do you call a sleeping dinosaur?', 'A dino snore!'],
  ['Where do cows go on Friday night?', 'To the moo-vies!'],
  ['Which letter of the alphabet has the most water?', 'The letter C!'],
  ['What do you call a bear with no teeth?', 'A gummy bear!'],
  ['Why was six afraid of seven?', 'Because seven ate nine!'],
  ['Which letter is always asking questions?', 'The letter Y!'],
  ['How do you make an octopus laugh?', 'With ten tickles!'],
  ['Why did the banana go to the doctor?', 'Because it was not peeling well.'],
  ['Which letter can sting you?', 'The letter B!'],
  ['What did the zero say to the eight?', 'Nice belt!'],
  ['Why did the cookie go to the doctor?', 'Because it felt crummy.'],
  ['What has hands, but cannot clap?', 'A clock!'],
  ['Why are fish so smart?', 'Because they live in schools.'],
  ['What did the ocean say to the beach?', 'Nothing. It just waved.'],
  ['What kind of tree fits in your hand?', 'A palm tree!'],
  ['Why did the robot go on vacation?', 'To recharge its batteries.'],
  ['What is brown and sticky?', 'A stick!'],
  ['What room can nobody walk into?', 'A mushroom!'],
  ['Why do bees have sticky hair?', 'Because they use honey combs.'],
  ['What do you call a pig that knows karate?', 'A pork chop!'],
];
export const COLORS = [
  { id: 'pink', name: 'Bubblegum', fill: '#f58ac0' }, { id: 'green', name: 'Lime', fill: '#63c98a' }, { id: 'orange', name: 'Sunset', fill: '#f5a04f' },
  { id: 'purple', name: 'Grape', fill: '#a17be8' }, { id: 'teal', name: 'Ocean', fill: '#45bcc4' }, { id: 'red', name: 'Cherry', fill: '#ef6b62' },
  { id: 'gold', name: 'Gold', fill: '#e9c23f' },
];
