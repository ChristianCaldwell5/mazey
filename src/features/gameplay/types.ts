export type Point = { x: number; y: number };

export type GameMode = 'QUICK' | 'LEVEL' | 'MULTIPLAYER';

export type GameState =
  | 'MENU'
  | 'LEVEL_SELECT'
  | 'PLAYING'
  | 'SETTINGS'
  | 'MULTIPLAYER_MENU'
  | 'LOBBY'
  | 'INTERMISSION';

export type ControlType = 'JOYSTICK' | 'DPAD';

export type Difficulty = 'emerald' | 'amber' | 'rose' | 'void';

export interface Level {
  id: number;
  width: number;
  height: number;
  hasKey: boolean;
  timeLimit?: number;
  seed: number;
  difficulty: Difficulty;
  starTimes: [number, number, number];
  starsRequired: number;
}

export interface Notification {
  id: string;
  message: string;
}

export interface IntermissionState<TLobby> {
  active: boolean;
  countdown: number;
  lobby: TLobby | null;
}
