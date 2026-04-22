import { TILE_SIZE } from '../constants';
import type { Level, Point } from '../types';

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

export interface MazeRunData {
  maze: number[][];
  mazeSize: { w: number; h: number };
  exitPos: Point;
  keyPos: Point | null;
  startPixelPos: Point;
  hasKeyInitially: boolean;
}

export function createMazeRun(level?: Level): MazeRunData {
  const w = level ? level.width : 31;
  const h = level ? level.height : 31;
  const rng = new SeededRandom(level ? level.seed : Math.random() * 1000000);

  const maze = Array(h)
    .fill(null)
    .map(() => Array(w).fill(1));

  const centerX = Math.floor(w / 2);
  const centerY = Math.floor(h / 2);
  const startX = centerX % 2 !== 0 ? centerX : centerX + 1;
  const startY = centerY % 2 !== 0 ? centerY : centerY + 1;

  function carve(x: number, y: number) {
    const dirs = [
      [0, -2],
      [0, 2],
      [-2, 0],
      [2, 0],
    ].sort(() => rng.next() - 0.5);

    maze[y][x] = 0;

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;

      if (ny > 0 && ny < h && nx > 0 && nx < w && maze[ny][nx] === 1) {
        maze[y + dy / 2][x + dx / 2] = 0;
        carve(nx, ny);
      }
    }
  }

  carve(startX, startY);

  for (let i = 0; i < (w * h) / 60; i += 1) {
    const rx = Math.floor(rng.next() * (w - 2)) + 1;
    const ry = Math.floor(rng.next() * (h - 2)) + 1;

    if (maze[ry][rx] === 1) {
      maze[ry][rx] = 0;
    }
  }

  const corners = [
    { x: 1, y: 1 },
    { x: w - 2, y: 1 },
    { x: 1, y: h - 2 },
    { x: w - 2, y: h - 2 },
  ];
  const exitIndex = Math.floor(rng.next() * corners.length);
  const exitPos = corners[exitIndex];
  maze[exitPos.y][exitPos.x] = 0;

  let keyPos: Point | null = null;

  if (level ? level.hasKey : true) {
    let attempts = 0;
    const minDistance = Math.floor(w / 3);

    while (!keyPos && attempts < 200) {
      const rx = Math.floor(rng.next() * (w - 2)) + 1;
      const ry = Math.floor(rng.next() * (h - 2)) + 1;
      const dist = Math.abs(rx - exitPos.x) + Math.abs(ry - exitPos.y);

      if (
        maze[ry][rx] === 0 &&
        (rx !== exitPos.x || ry !== exitPos.y) &&
        (rx !== startX || ry !== startY) &&
        dist >= minDistance
      ) {
        keyPos = { x: rx, y: ry };
      }

      attempts += 1;
    }

    if (!keyPos) {
      const oppositeCornerIndex = corners.findIndex(
        (corner) => corner.x !== exitPos.x && corner.y !== exitPos.y,
      );
      keyPos = corners[oppositeCornerIndex];
    }

    maze[keyPos.y][keyPos.x] = 0;
  }

  return {
    maze,
    mazeSize: { w, h },
    exitPos,
    keyPos,
    startPixelPos: {
      x: startX * TILE_SIZE + TILE_SIZE / 2,
      y: startY * TILE_SIZE + TILE_SIZE / 2,
    },
    hasKeyInitially: !(level ? level.hasKey : true),
  };
}
