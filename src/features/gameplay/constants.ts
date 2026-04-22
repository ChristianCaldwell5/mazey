import type { Level } from './types';

export const TILE_SIZE = 32;
export const VISION_RADIUS = 180;
export const PLAYER_SPEED = 5.0;
export const PLAYER_COLLISION_RADIUS = 10;
export const VIEWPORT_WIDTH = 640;
export const VIEWPORT_HEIGHT = 480;

export const LEVELS: Level[] = [
  { id: 1, width: 15, height: 15, hasKey: false, seed: 101, difficulty: 'emerald', starTimes: [8, 12, 20], starsRequired: 0 },
  { id: 2, width: 15, height: 15, hasKey: true, seed: 102, difficulty: 'emerald', starTimes: [10, 15, 25], starsRequired: 0 },
  { id: 3, width: 19, height: 19, hasKey: true, seed: 103, difficulty: 'emerald', starTimes: [15, 22, 35], starsRequired: 2 },
  { id: 4, width: 21, height: 21, hasKey: true, seed: 104, difficulty: 'amber', starTimes: [20, 30, 45], starsRequired: 5 },
  { id: 5, width: 23, height: 23, hasKey: true, seed: 105, difficulty: 'amber', starTimes: [25, 35, 55], starsRequired: 8 },
  { id: 6, width: 25, height: 25, hasKey: true, seed: 106, difficulty: 'amber', starTimes: [30, 45, 70], starsRequired: 12 },
  { id: 7, width: 27, height: 27, hasKey: true, seed: 107, difficulty: 'rose', starTimes: [40, 60, 90], starsRequired: 16 },
  { id: 8, width: 29, height: 29, hasKey: true, seed: 108, difficulty: 'rose', starTimes: [50, 75, 110], starsRequired: 20 },
  { id: 9, width: 31, height: 31, hasKey: true, timeLimit: 60, seed: 109, difficulty: 'rose', starTimes: [45, 55, 60], starsRequired: 24 },
  { id: 10, width: 35, height: 35, hasKey: true, timeLimit: 45, seed: 110, difficulty: 'void', starTimes: [35, 40, 45], starsRequired: 28 },
];
