import type { Robot } from './types.js';

/** The default: no robot. */
export const noRobot: Robot = {
  react() {}, puzzled() {}, faceTurn() {}, celebrate() {}, status: async () => 'unconfigured',
};
