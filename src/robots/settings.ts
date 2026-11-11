/** Robot choices, per device (localStorage), not per child. The default is no robot and no address. */
import { track } from '../telemetry.js';
import type { RobotSettings } from './types.js';

const K = { type: 'robot.type', address: 'robot.address', mode: 'robot.mode', sounds: 'robot.sounds' };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
export const robotSettings = (): RobotSettings => ({
  type: read(K.type) || 'none', address: (read(K.address) ?? '').trim().replace(/\/+$/, ''),
  mode: read(K.mode) === 'floor' ? 'floor' : 'table', sounds: read(K.sounds) === '1',
});
export function setRobotSettings(p: Partial<RobotSettings>) {
  if (p.type !== undefined) { write(K.type, p.type); track('robot_type', { type: p.type }); }
  if (p.address !== undefined) write(K.address, p.address.trim());
  if (p.mode) write(K.mode, p.mode);
  if (p.sounds !== undefined) write(K.sounds, p.sounds ? '1' : '0');
}
