/** One voice channel for recorded clips, a second for letter sounds, and synthesized sound effects.
 *  Recordings are optional (public/audio/ is not shipped): any clip that is missing is spoken by the device's own voice instead. */
import { track } from './telemetry.js';
export interface Clip { path: string; text: string }

let voice: HTMLAudioElement | undefined, letters: HTMLAudioElement | undefined, ctx: AudioContext | undefined;
let turn = 0, opened = false, failed = '';
/** Clips that failed to load: not asked for again, so a game with no recordings does not repeat a failed request for every word. */
const missing = new Set<string>(), reported = new Set<string>();
const listeners = new Set<(speaking: boolean) => void>();
export function onSpeaking(fn: (speaking: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function speaking(on: boolean) { listeners.forEach(fn => fn(on)); }

/** Call from a tap: iPad Safari only allows sound after a touch. */
export function unlock() {
  voice ??= new Audio(); letters ??= new Audio();
  try { ctx ??= new AudioContext(); void ctx.resume(); } catch { /* sound effects are optional */ }
  if (!opened) { opened = true; setTimeout(() => track('audio_unlock', { state: ctx?.state ?? 'none' }), 500); }
}
function playOne(el: HTMLAudioElement, src: string): Promise<boolean> {
  return new Promise(resolve => {
    const done = (ok: boolean, why = '') => { el.onended = el.onerror = null; clearTimeout(timer); failed = ok ? '' : why; resolve(ok); };
    const timer = setTimeout(() => done(false, 'timeout'), 20000);
    el.onended = () => done(true); el.onerror = () => done(false, `load error ${el.error?.code ?? ''}`.trim());
    el.src = src; el.play().catch(e => done(false, `play ${(e as Error)?.name ?? e}`));
  });
}
/** If a recording is missing, fall back to the device voice so the game still works. */
function speakFallback(text: string): Promise<void> {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9; u.onend = u.onerror = () => resolve();
    setTimeout(resolve, Math.max(8000, text.length * 110)); // long lessons need longer than a short word
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}
export function stop() { turn++; voice?.pause(); if ('speechSynthesis' in window) speechSynthesis.cancel(); speaking(false); }
/** Speak clips in order. A newer call interrupts an older one; resolves false if interrupted. */
export async function say(clips: Clip[], gap = 180): Promise<boolean> {
  stop();
  const mine = turn;
  voice ??= new Audio();
  speaking(true);
  for (const clip of clips) {
    const ok = missing.has(clip.path) ? false : await playOne(voice, `/audio/${clip.path}.m4a`);
    if (mine !== turn) return false;
    if (!ok) { if (/^(load error|play NotSupported)/.test(failed)) missing.add(clip.path); if (!reported.has(clip.path)) { reported.add(clip.path); track('audio', { path: clip.path, reason: failed, fallback: 'speechSynthesis' in window ? 'speech' : 'silence' }); } await speakFallback(clip.text); if (mine !== turn) return false; }
    await new Promise(r => setTimeout(r, gap));
    if (mine !== turn) return false;
  }
  speaking(false);
  return true;
}
/** The sound a letter makes. The recordings are optional and not shipped; without them this is silent (the device voice would say the
 *  letter's name, "bee", which teaches the wrong thing), and the tap still gets its click from sfx('place'). */
export function letterSound(letter: string) {
  const path = `letters/${letter}`;
  if (missing.has(path)) return;
  letters ??= new Audio();
  letters.src = `/audio/${path}.mp3`;
  letters.play().catch(e => { if ((e as Error)?.name !== 'NotAllowedError') missing.add(path); if (!reported.has(path)) { reported.add(path); track('audio', { path, reason: `play ${(e as Error)?.name ?? e}`, fallback: 'silence' }); } });
}
/** Which optional recordings are installed (used to show credits only when they are). */
export async function audioAvailable(): Promise<{ voice: boolean; letters: boolean }> {
  const has = (path: string) => fetch(`/audio/${path}`, { method: 'HEAD' }).then(r => r.ok && !/text\/html/.test(r.headers.get('content-type') ?? '')).catch(() => false);
  const [voice, letters] = await Promise.all([has('r/praise_1.m4a'), has('letters/a.mp3')]);
  return { voice, letters };
}

type Sfx = 'tap' | 'place' | 'bad' | 'good' | 'win' | 'star' | 'boop';
const TUNES: Record<Sfx, [number, number, number][]> = {
  // [frequency, start, length]
  tap: [[520, 0, 0.05]], place: [[660, 0, 0.07]], boop: [[300, 0, 0.08], [450, 0.08, 0.1]],
  bad: [[220, 0, 0.12], [180, 0.12, 0.18]],
  good: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.18]],
  win: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.3]],
  star: [[880, 0, 0.08], [1175, 0.08, 0.16]],
};
export function sfx(name: Sfx) {
  if (!ctx) return;
  try {
    for (const [freq, start, length] of TUNES[name]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime + start;
      osc.type = name === 'bad' ? 'sawtooth' : 'triangle'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(name === 'bad' ? 0.08 : 0.16, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + length + 0.02);
    }
  } catch { /* ignore */ }
}
