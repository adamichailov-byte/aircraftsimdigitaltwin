import type { CameraCommand } from './CameraRig';

export type KeyboardPanCommand = { type: 'keyboard-pan'; key: 'w' | 'a' | 's' | 'd' };
export type KeyboardCameraCommand = CameraCommand | KeyboardPanCommand;

const moveCommands: Record<string, CameraCommand> = {
  ArrowLeft: { type: 'move', action: 'left' },
  ArrowRight: { type: 'move', action: 'right' },
  ArrowUp: { type: 'move', action: 'up' },
  ArrowDown: { type: 'move', action: 'down' },
  '+': { type: 'move', action: 'in' },
  '=': { type: 'move', action: 'in' },
  '-': { type: 'move', action: 'out' },
};

export function cameraCommandForKey(key: string): KeyboardCameraCommand | null {
  const normalized = key.toLowerCase();
  if (normalized === 'w' || normalized === 'a' || normalized === 's' || normalized === 'd') {
    return { type: 'keyboard-pan', key: normalized };
  }
  if (normalized === 'home' || normalized === 'h') return { type: 'home' };
  return moveCommands[key] ?? null;
}
