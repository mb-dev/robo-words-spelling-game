/** The robot plug-in point. To add a robot: implement `Robot` (see types.ts) and add one entry to ROBOT_TYPES. */
import { createMTiny } from './mtiny.js';
import { noRobot } from './none.js';
import { robotSettings } from './settings.js';
import type { Robot } from './types.js';

export { robotSettings, setRobotSettings } from './settings.js';
export type { Robot, RobotSettings, RobotStatus, Side } from './types.js';

const mtiny = createMTiny(() => robotAddress());
export interface RobotType {
  id: string; label: string; blurb: string;
  /** Used when no address is set. Empty means the grown-up must enter one. */
  defaultAddress: string; /** Show the mTiny-only options (table/floor, sounds). */ mtinyOptions?: boolean;
  robot: Robot;
}
export const ROBOT_TYPES: RobotType[] = [
  { id: 'none', label: 'No robot', blurb: 'The game runs on its own.', defaultAddress: '', robot: noRobot },
  { id: 'mtiny', label: 'Makeblock mTiny', blurb: 'Needs the robot-mtiny-control server (github.com/mb-dev/robot-mtiny-control). Enter its address.', defaultAddress: '', mtinyOptions: true, robot: mtiny },
  { id: 'fake-tiny', label: 'Fake mTiny (for trying it)', blurb: 'Run "node tools/fake-tiny.mjs" on the computer; it prints what the robot would do.', defaultAddress: 'http://localhost:8766', mtinyOptions: true, robot: mtiny },
];
export const robotType = (id = robotSettings().type): RobotType => ROBOT_TYPES.find(t => t.id === id) ?? ROBOT_TYPES[0];
/** The address the current robot will be called on: the saved one, else the type's default. */
export const robotAddress = (): string => robotSettings().address || robotType().defaultAddress;

/** What the game calls. It forwards to whichever robot is chosen right now. */
export const robot: Robot = {
  react: (word, act, stars) => robotType().robot.react(word, act, stars),
  puzzled: () => robotType().robot.puzzled(),
  faceTurn: side => robotType().robot.faceTurn(side),
  celebrate: (kind, center) => robotType().robot.celebrate(kind, center),
  status: () => robotType().robot.status(),
};
