/** What the game asks of a robot. A robot is optional; the game never waits for one and every failure is swallowed. */
import type { Act } from '../content/reactions.js';

export type RobotStatus = 'ready' | 'asleep' | 'unreachable' | 'unconfigured';
export type Side = 'left' | 'center' | 'right';
export interface Robot {
  /** Act out a spelled word (or cheer, if the robot has nothing special for it). `stars` is 1 to 3. */
  react(word: string, act: Act | undefined, stars?: number): void;
  /** A wrong answer. */
  puzzled(): void;
  /** Together mode: turn a little toward the player whose turn it is. */
  faceTurn(side: Side): void;
  /** End of a mission, boss round or rocket launch. `center`: together mode, so turn back to the middle first. */
  celebrate(kind: 'mission' | 'boss' | 'rocket', center?: boolean): void;
  /** Is the robot there? Used by the grown-ups page. */
  status(): Promise<RobotStatus>;
}
/** Saved per device in localStorage. `address` is the robot's base URL; empty by default. */
export interface RobotSettings {
  type: string; address: string;
  /** mTiny only: `table` turns on the spot, `floor` may drive up to 100 mm out and back. */
  mode: 'table' | 'floor';
  /** mTiny only: the robot's built-in animal and object clips. */
  sounds: boolean;
}
