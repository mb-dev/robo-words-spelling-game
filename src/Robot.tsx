import { useEffect, useState } from 'react';
import { onSpeaking } from './audio.js';
import { COLORS, type Act } from './content/reactions.js';

export type Mood = 'idle' | 'cheer' | 'oops' | 'think';
const MOUTH: Record<Mood, string> = {
  idle: 'M126 160q24 22 48 0', cheer: 'M120 154q30 38 60 0z', oops: 'M130 168q20 -12 40 0', think: 'M134 164h32',
};
/** Robo, with whatever it has unlocked to wear. */
export function Robot({ mood = 'idle', gear, color, act, size = 220, onPoke }: { mood?: Mood; gear?: string | null; color?: string | null; act?: Act; size?: number; onPoke?: () => void }) {
  const fill = COLORS.find(c => c.id === color)?.fill;
  const [talking, setTalking] = useState(false);
  useEffect(() => onSpeaking(setTalking), []);
  return (
    <div className="robot-wrap" data-mood={mood} data-talking={talking} data-act={act} style={{ width: size, height: size, ...(fill ? { ['--robo' as string]: fill } : {}) }} onClick={onPoke} role={onPoke ? 'button' : undefined} aria-label="Robo the robot">
      <svg viewBox="0 0 300 300" className="robot-svg">
        {gear === 'cape' && <path d="M100 236 L52 296 L248 296 L200 236z" fill="#e8504f" stroke="#8f2323" strokeWidth="5" strokeLinejoin="round" />}
        {gear === 'rocket' && <g className="flames"><path d="M108 284q8 22 16 0z" fill="#ff9d2e" /><path d="M176 284q8 22 16 0z" fill="#ff9d2e" /></g>}
        <path className="r-line" d="M150 44V26" /><circle className="r-tip" cx="150" cy="20" r="10" />
        <rect className="r-ear" x="30" y="108" width="24" height="64" rx="12" /><rect className="r-ear" x="246" y="108" width="24" height="64" rx="12" />
        <rect className="r-head" x="46" y="44" width="208" height="184" rx="56" />
        <rect className="r-screen" x="64" y="62" width="172" height="146" rx="42" />
        <g className="r-eyes">
          {mood === 'cheer'
            ? <><path className="r-smile-eye" d="M96 122q15 -18 30 0" /><path className="r-smile-eye" d="M174 122q15 -18 30 0" /></>
            : <><ellipse className="r-eye" cx="111" cy="118" rx="12" ry={mood === 'think' ? 9 : 16} /><ellipse className="r-eye" cx="189" cy="118" rx="12" ry={mood === 'think' ? 9 : 16} /></>}
        </g>
        <path className="r-cheek" d="M80 150q12 -8 24 0" /><path className="r-cheek" d="M196 150q12 -8 24 0" />
        <path className="r-mouth" d={MOUTH[mood]} />
        <path className="r-line" d="M128 228v14m44 -14v14" /><rect className="r-body" x="90" y="240" width="120" height="46" rx="22" />
        <circle className="r-light" cx="150" cy="263" r="8" />
        {gear === 'bowtie' && <path d="M150 240 L122 226 V254z M150 240 L178 226 V254z" fill="#e8504f" stroke="#8f2323" strokeWidth="4" strokeLinejoin="round" />}
        {gear === 'cap' && <g><path d="M150 -14 L112 50 H188z" fill="#ff7fb0" stroke="#a83a6c" strokeWidth="5" strokeLinejoin="round" /><circle cx="150" cy="-14" r="9" fill="#ffd84d" /></g>}
        {gear === 'shades' && <g><rect x="84" y="100" width="56" height="34" rx="12" fill="#1d2433" /><rect x="160" y="100" width="56" height="34" rx="12" fill="#1d2433" /><path d="M140 112h20" stroke="#1d2433" strokeWidth="6" /></g>}
        {gear === 'crown' && <path d="M100 50 L96 6 L126 30 L150 0 L174 30 L204 6 L200 50z" fill="#ffd84d" stroke="#b98a00" strokeWidth="5" strokeLinejoin="round" />}
      </svg>
    </div>
  );
}
