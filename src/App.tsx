/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Timer, RefreshCw, Move, Zap, Lock, Unlock, Key, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { auth, signInWithGoogle, logout, db, onAuthStateChanged, User, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ErrorBoundary } from './components/ErrorBoundary';

const TILE_SIZE = 32;
const VISION_RADIUS = 180;
const MAZE_WIDTH = 31; // Increased for better panning demo
const MAZE_HEIGHT = 31;
const PLAYER_SPEED = 4.5;
const PLAYER_COLLISION_RADIUS = 10;
const VIEWPORT_WIDTH = 640;
const VIEWPORT_HEIGHT = 480;

type Point = { x: number; y: number };
type GameMode = 'QUICK' | 'LEVEL';
type GameState = 'MENU' | 'LEVEL_SELECT' | 'PLAYING';

interface Level {
  id: number;
  width: number;
  height: number;
  hasKey: boolean;
  timeLimit?: number;
  seed: number;
  difficulty: 'emerald' | 'amber' | 'rose' | 'void';
}

const LEVELS: Level[] = [
  { id: 1, width: 15, height: 15, hasKey: false, seed: 101, difficulty: 'emerald' },
  { id: 2, width: 15, height: 15, hasKey: true, seed: 102, difficulty: 'emerald' },
  { id: 3, width: 19, height: 19, hasKey: true, seed: 103, difficulty: 'emerald' },
  { id: 4, width: 21, height: 21, hasKey: true, seed: 104, difficulty: 'amber' },
  { id: 5, width: 23, height: 23, hasKey: true, seed: 105, difficulty: 'amber' },
  { id: 6, width: 25, height: 25, hasKey: true, seed: 106, difficulty: 'amber' },
  { id: 7, width: 27, height: 27, hasKey: true, seed: 107, difficulty: 'rose' },
  { id: 8, width: 29, height: 29, hasKey: true, seed: 108, difficulty: 'rose' },
  { id: 9, width: 31, height: 31, hasKey: true, timeLimit: 60, seed: 109, difficulty: 'rose' },
  { id: 10, width: 35, height: 35, hasKey: true, timeLimit: 45, seed: 110, difficulty: 'void' },
];

// Simple LCG for deterministic randomness
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [gameMode, setGameMode] = useState<GameMode>('QUICK');
  const [currentLevel, setCurrentLevel] = useState<Level | null>(null);
  const [playerPos, setPlayerPos] = useState<Point>({ x: 0, y: 0 });
  const [maze, setMaze] = useState<number[][]>([]);
  const [mazeSize, setMazeSize] = useState({ w: 31, h: 31 });
  const [exitPos, setExitPos] = useState<Point>({ x: 0, y: 0 });
  const [keyPos, setKeyPos] = useState<Point | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [isEscaped, setIsEscaped] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [bestTimes, setBestTimes] = useState<Record<number, number>>({});
  const [gameStarted, setGameStarted] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  const [joystick, setJoystick] = useState<{ active: boolean; base: Point; stick: Point } | null>(null);
  const [activePulse, setActivePulse] = useState<{
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
    color: string;
  } | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load best times from LocalStorage and Firestore
  useEffect(() => {
    const loadProgress = async () => {
      // 1. Load from LocalStorage first for immediate UI
      const saved = localStorage.getItem('neon_rush_best_times');
      let localBestTimes = saved ? JSON.parse(saved) : {};
      setBestTimes(localBestTimes);

      // 2. If logged in, sync with Firestore
      if (user) {
        const userPath = `users/${user.uid}`;
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const remoteBestTimes = userDoc.data().bestTimes || {};
            // Merge: Remote takes precedence for same level, but keep local-only levels
            const merged = { ...localBestTimes, ...remoteBestTimes };
            setBestTimes(merged);
            localStorage.setItem('neon_rush_best_times', JSON.stringify(merged));
          } else {
            // Create user doc if it doesn't exist
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoURL: user.photoURL,
              bestTimes: localBestTimes,
              totalEscapes: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, userPath);
        }
      }
    };

    if (!isAuthLoading) {
      loadProgress();
    }
  }, [user, isAuthLoading]);

  const saveBestTime = async (levelId: number, time: number) => {
    const newBestTimes = { ...bestTimes };
    if (!newBestTimes[levelId] || time < newBestTimes[levelId]) {
      newBestTimes[levelId] = time;
      setBestTimes(newBestTimes);
      localStorage.setItem('neon_rush_best_times', JSON.stringify(newBestTimes));

      // Sync to Firestore if logged in
      if (user) {
        const userPath = `users/${user.uid}`;
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            [`bestTimes.${levelId}`]: time,
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, userPath);
        }
      }
    }
  };

  // Refs for high-frequency updates
  const playerRef = useRef<Point>({ x: 0, y: 0 });
  const keysPressed = useRef<Set<string>>(new Set());
  const requestRef = useRef<number>(null);
  const mazeRef = useRef<number[][]>([]);
  const exitRef = useRef<Point>({ x: 0, y: 0 });
  const keyRef = useRef<Point | null>(null);
  const hasKeyRef = useRef<boolean>(false);
  const joystickRef = useRef<{ active: boolean; base: Point; stick: Point } | null>(null);

  useEffect(() => {
    const handleResize = () => {
      const w = Math.min(window.innerWidth - 64, VIEWPORT_WIDTH);
      const h = Math.min(window.innerHeight - 300, VIEWPORT_HEIGHT);
      setViewportSize({ width: w, height: h });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!gameStarted || isEscaped || isGameOver || gameState !== 'PLAYING') return;
    
    const interval = setInterval(() => {
      const target = (currentLevel?.hasKey || gameMode === 'QUICK') ? (hasKey ? exitPos : keyPos) : exitPos;
      if (!target) return;

      const tx = target.x * TILE_SIZE + TILE_SIZE / 2;
      const ty = target.y * TILE_SIZE + TILE_SIZE / 2;
      const px = playerRef.current.x;
      const py = playerRef.current.y;
      
      setActivePulse({
        top: ty < py - TILE_SIZE,
        bottom: ty > py + TILE_SIZE,
        left: tx < px - TILE_SIZE,
        right: tx > px + TILE_SIZE,
        color: hasKey ? '#22c55e' : '#f59e0b'
      });

      // Clear pulse after 2 seconds
      setTimeout(() => setActivePulse(null), 2000);
    }, 15000);

    return () => clearInterval(interval);
  }, [gameStarted, isEscaped, hasKey, exitPos, keyPos, gameState]);

  // Maze Generation (Recursive Backtracker)
  const generateNewMaze = useCallback((level?: Level) => {
    const w = level ? level.width : 31;
    const h = level ? level.height : 31;
    const rng = new SeededRandom(level ? level.seed : Math.random() * 1000000);
    
    setMazeSize({ w, h });
    const newMaze = Array(h).fill(null).map(() => Array(w).fill(1));
    const centerX = Math.floor(w / 2);
    const centerY = Math.floor(h / 2);
    
    const startX = centerX % 2 !== 0 ? centerX : centerX + 1;
    const startY = centerY % 2 !== 0 ? centerY : centerY + 1;

    function carve(x: number, y: number) {
      const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]].sort(() => rng.next() - 0.5);
      newMaze[y][x] = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (ny > 0 && ny < h && nx > 0 && nx < w && newMaze[ny][nx] === 1) {
          newMaze[y + dy / 2][x + dx / 2] = 0;
          carve(nx, ny);
        }
      }
    }

    carve(startX, startY);
    
    for (let i = 0; i < (w * h) / 60; i++) {
      const rx = Math.floor(rng.next() * (w - 2)) + 1;
      const ry = Math.floor(rng.next() * (h - 2)) + 1;
      if (newMaze[ry][rx] === 1) newMaze[ry][rx] = 0;
    }

    const corners = [
      { x: 1, y: 1 },
      { x: w - 2, y: 1 },
      { x: 1, y: h - 2 },
      { x: w - 2, y: h - 2 }
    ];
    const exitIndex = Math.floor(rng.next() * corners.length);
    const selectedExit = corners[exitIndex];
    newMaze[selectedExit.y][selectedExit.x] = 0;

    let selectedKey: Point | null = null;
    if (level ? level.hasKey : true) {
      let attempts = 0;
      const MIN_DISTANCE = Math.floor(w / 3);
      while (!selectedKey && attempts < 200) {
        const rx = Math.floor(rng.next() * (w - 2)) + 1;
        const ry = Math.floor(rng.next() * (h - 2)) + 1;
        const dist = Math.abs(rx - selectedExit.x) + Math.abs(ry - selectedExit.y);
        if (newMaze[ry][rx] === 0 && (rx !== selectedExit.x || ry !== selectedExit.y) && (rx !== startX || ry !== startY) && dist >= MIN_DISTANCE) {
          selectedKey = { x: rx, y: ry };
        }
        attempts++;
      }
      if (!selectedKey) {
        const oppositeCornerIndex = corners.findIndex(c => c.x !== selectedExit.x && c.y !== selectedExit.y);
        selectedKey = corners[oppositeCornerIndex];
      }
      newMaze[selectedKey.y][selectedKey.x] = 0;
    }
    
    setMaze(newMaze);
    mazeRef.current = newMaze;
    setExitPos(selectedExit);
    exitRef.current = selectedExit;
    setKeyPos(selectedKey);
    keyRef.current = selectedKey;
    setHasKey(!(level ? level.hasKey : true));
    hasKeyRef.current = !(level ? level.hasKey : true);

    const startPixelPos = { x: startX * TILE_SIZE + TILE_SIZE / 2, y: startY * TILE_SIZE + TILE_SIZE / 2 };
    setPlayerPos(startPixelPos);
    playerRef.current = startPixelPos;
    setIsEscaped(false);
    setIsGameOver(false);
    setGameStarted(false);
    setElapsedTime(0);
  }, []);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      generateNewMaze(currentLevel || undefined);
    }
  }, [gameState, currentLevel, generateNewMaze]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
      if (!gameStarted && gameState === 'PLAYING' && !showBriefing && 
          ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        setGameStarted(true);
        setStartTime(Date.now());
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (gameState !== 'PLAYING' || isEscaped || isGameOver || showBriefing) return;
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const base = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      const newJoystick = { active: true, base, stick: base };
      setJoystick(newJoystick);
      joystickRef.current = newJoystick;

      if (!gameStarted) {
        setGameStarted(true);
        setStartTime(Date.now());
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!joystickRef.current?.active) return;
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const stick = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      const dx = stick.x - joystickRef.current.base.x;
      const dy = stick.y - joystickRef.current.base.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 40;

      if (dist > maxDist) {
        const angle = Math.atan2(dy, dx);
        stick.x = joystickRef.current.base.x + Math.cos(angle) * maxDist;
        stick.y = joystickRef.current.base.y + Math.sin(angle) * maxDist;
      }

      const updatedJoystick = { ...joystickRef.current, stick };
      setJoystick(updatedJoystick);
      joystickRef.current = updatedJoystick;
    };

    const handleTouchEnd = () => {
      setJoystick(null);
      joystickRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [gameStarted, gameState, isEscaped, showBriefing]);

  const checkCollision = (nx: number, ny: number, currentMaze: number[][]) => {
    const corners = [
      { x: nx - PLAYER_COLLISION_RADIUS, y: ny - PLAYER_COLLISION_RADIUS },
      { x: nx + PLAYER_COLLISION_RADIUS, y: ny - PLAYER_COLLISION_RADIUS },
      { x: nx - PLAYER_COLLISION_RADIUS, y: ny + PLAYER_COLLISION_RADIUS },
      { x: nx + PLAYER_COLLISION_RADIUS, y: ny + PLAYER_COLLISION_RADIUS },
    ];

    for (const corner of corners) {
      // Boundary check
      if (corner.x < 0 || corner.x >= mazeSize.w * TILE_SIZE || 
          corner.y < 0 || corner.y >= mazeSize.h * TILE_SIZE) return true;

      const tx = Math.floor(corner.x / TILE_SIZE);
      const ty = Math.floor(corner.y / TILE_SIZE);
      if (currentMaze[ty] && currentMaze[ty][tx] === 1) return true;
    }
    return false;
  };

  const update = useCallback(() => {
    if (gameState !== 'PLAYING' || isEscaped || isGameOver || !mazeRef.current.length || !gameStarted || showBriefing) return;

    let dx = 0;
    let dy = 0;

    // Keyboard Input
    if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) dy -= PLAYER_SPEED;
    if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) dy += PLAYER_SPEED;
    if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) dx -= PLAYER_SPEED;
    if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) dx += PLAYER_SPEED;

    // Joystick Input
    if (joystickRef.current?.active) {
      const jdx = joystickRef.current.stick.x - joystickRef.current.base.x;
      const jdy = joystickRef.current.stick.y - joystickRef.current.base.y;
      const dist = Math.sqrt(jdx * jdx + jdy * jdy);
      if (dist > 5) {
        // Use constant PLAYER_SPEED for fairness with desktop
        dx = (jdx / dist) * PLAYER_SPEED;
        dy = (jdy / dist) * PLAYER_SPEED;
      }
    }

    if (dx !== 0 || dy !== 0) {
      const currentPos = playerRef.current;
      let nextX = currentPos.x;
      let nextY = currentPos.y;

      // Try X movement independently for sliding
      if (!checkCollision(currentPos.x + dx, currentPos.y, mazeRef.current)) {
        nextX += dx;
      }
      // Try Y movement independently for sliding
      if (!checkCollision(currentPos.x, currentPos.y + dy, mazeRef.current)) {
        nextY += dy;
      }

      playerRef.current = { x: nextX, y: nextY };
      setPlayerPos({ x: nextX, y: nextY });

      // Check Key Collection
      if (!hasKeyRef.current && keyRef.current) {
        const kx = keyRef.current.x * TILE_SIZE + TILE_SIZE / 2;
        const ky = keyRef.current.y * TILE_SIZE + TILE_SIZE / 2;
        const dist = Math.sqrt((nextX - kx) ** 2 + (nextY - ky) ** 2);
        if (dist < TILE_SIZE / 1.5) {
          hasKeyRef.current = true;
          setHasKey(true);
        }
      }

      // Check Exit
      const tx = Math.floor(nextX / TILE_SIZE);
      const ty = Math.floor(nextY / TILE_SIZE);
      
      if (hasKeyRef.current && tx === exitRef.current.x && ty === exitRef.current.y) {
        setIsEscaped(true);
        if (gameMode === 'LEVEL' && currentLevel) {
          saveBestTime(currentLevel.id, (Date.now() - startTime) / 1000);
        }
      }
    }

    if (gameStarted && !isEscaped && !isGameOver) {
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      setElapsedTime(elapsed);

      if (currentLevel?.timeLimit && elapsed >= currentLevel.timeLimit) {
        setIsGameOver(true);
      }
    }

    requestRef.current = requestAnimationFrame(update);
  }, [gameState, isEscaped, isGameOver, gameStarted, startTime, currentLevel, gameMode]);

  useEffect(() => {
    if (gameState === 'PLAYING' && !isEscaped && !isGameOver) {
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, isEscaped, isGameOver, update]);

  // Rendering
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    if (!canvas || maze.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const px = playerPos.x;
    const py = playerPos.y;

    // Calculate Camera Position (Centered on player, clamped to maze bounds)
    const camX = Math.max(0, Math.min(px - viewportSize.width / 2, mazeSize.w * TILE_SIZE - viewportSize.width));
    const camY = Math.max(0, Math.min(py - viewportSize.height / 2, mazeSize.h * TILE_SIZE - viewportSize.height));

    // Clear Canvas
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camX, -camY);

    // Draw Maze Walls
    ctx.fillStyle = '#1e293b';
    maze.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 1) {
          // Optimization: Only draw if within viewport + buffer
          const wx = x * TILE_SIZE;
          const wy = y * TILE_SIZE;
          if (wx + TILE_SIZE > camX && wx < camX + viewportSize.width &&
              wy + TILE_SIZE > camY && wy < camY + viewportSize.height) {
            ctx.fillRect(wx, wy, TILE_SIZE, TILE_SIZE);
          }
        }
      });
    });

    // Draw Exit
    const ex = exitPos.x * TILE_SIZE + TILE_SIZE / 2;
    const ey = exitPos.y * TILE_SIZE + TILE_SIZE / 2;
    ctx.save();
    ctx.shadowBlur = 20;
    const exitColor = hasKey ? '#22c55e' : '#ef4444'; // green-500 or red-500
    ctx.shadowColor = exitColor;
    ctx.fillStyle = exitColor;
    ctx.beginPath();
    ctx.arc(ex, ey, TILE_SIZE / 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw Key
    if (!hasKey && keyPos) {
      const kx = keyPos.x * TILE_SIZE + TILE_SIZE / 2;
      const ky = keyPos.y * TILE_SIZE + TILE_SIZE / 2;
      const pulse = Math.sin(Date.now() / 200) * 10 + 15;
      
      ctx.save();
      ctx.shadowBlur = pulse;
      ctx.shadowColor = '#f59e0b'; // amber-500
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(kx, ky - 8);
      ctx.lineTo(kx + 6, ky);
      ctx.lineTo(kx, ky + 8);
      ctx.lineTo(kx - 6, ky);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Draw Player
    ctx.save();
    if (hasKey) {
      ctx.shadowBlur = 35;
      ctx.shadowColor = '#f59e0b';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, TILE_SIZE / 2.8, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#06b6d4';
    }
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(px, py, TILE_SIZE / 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore(); // End of translated maze drawing

    // Fog of War (Drawn on top of everything, but relative to screen)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.fillStyle = 'rgba(2, 6, 23, 0.98)';
    tempCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Player position relative to viewport
    const screenX = px - camX;
    const screenY = py - camY;

    const gradient = tempCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, VISION_RADIUS);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.4)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    
    tempCtx.globalCompositeOperation = 'destination-out';
    tempCtx.fillStyle = gradient;
    tempCtx.beginPath();
    tempCtx.arc(screenX, screenY, VISION_RADIUS, 0, Math.PI * 2);
    tempCtx.fill();

    ctx.drawImage(tempCanvas, 0, 0);

  }, [gameState, playerPos, maze, exitPos, hasKey, keyPos, viewportSize]);

  if (gameState === 'MENU') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-10"
        >
          <div className="space-y-3">
            <motion.div 
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-cyan-500/20 border border-cyan-500/30 mb-4"
            >
              <Zap className="w-10 h-10 text-cyan-400" />
            </motion.div>
            <h1 className="text-6xl font-black tracking-tighter bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent">
              MAZEY
            </h1>
          </div>

          <div className="flex flex-col gap-4">
            {isAuthLoading ? (
              <div className="h-14 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-700" />
              </div>
            ) : !user ? (
              <button 
                onClick={signInWithGoogle}
                className="group relative px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg border border-slate-800 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <LogIn className="w-5 h-5 text-cyan-400" />
                Sign in with Google
              </button>
            ) : (
              <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border border-cyan-500/30" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-sm font-bold text-white truncate max-w-[120px]">{user.displayName}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Authenticated</p>
                  </div>
                </div>
                <button 
                  onClick={logout}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-red-400"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}

            <button 
              onClick={() => { setGameMode('QUICK'); setGameState('PLAYING'); setCurrentLevel(null); setShowBriefing(true); }}
              className="group relative px-8 py-4 bg-white text-slate-950 rounded-2xl font-bold text-xl hover:bg-cyan-50 transition-all active:scale-95 flex items-center justify-center gap-3 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              <Zap className="w-5 h-5 fill-current" />
              Quick Play
            </button>

            <button 
              onClick={() => setGameState('LEVEL_SELECT')}
              className="group relative px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xl border border-slate-800 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              <Trophy className="w-5 h-5 text-amber-400" />
              Levels
            </button>
            
            <button 
              disabled
              className="px-8 py-4 bg-slate-950 text-slate-700 rounded-2xl font-bold text-xl border border-slate-900 cursor-not-allowed flex items-center justify-center gap-3"
            >
              <RefreshCw className="w-5 h-5 opacity-50" />
              Multiplayer (Coming Soon)
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (gameState === 'LEVEL_SELECT') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans">
        <div className="max-w-4xl w-full space-y-12">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <button 
                onClick={() => setGameState('MENU')}
                className="text-slate-500 hover:text-white transition-colors text-sm font-medium"
              >
                ← Back to Menu
              </button>
              <h1 className="text-5xl font-black tracking-tighter text-white">LEVELS</h1>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-xs uppercase tracking-widest">Progression</p>
              <p className="text-2xl font-mono font-bold text-cyan-400">
                {Object.keys(bestTimes).length}/{LEVELS.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {LEVELS.map((level) => {
              const isBest = bestTimes[level.id];
              const difficultyColors = {
                emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10',
                amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10',
                rose: 'border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10',
                void: 'border-purple-500/30 bg-purple-500/5 text-purple-400 hover:bg-purple-500/10',
              };

              return (
                <button
                  key={level.id}
                  onClick={() => { setGameMode('LEVEL'); setCurrentLevel(level); setGameState('PLAYING'); setShowBriefing(true); }}
                  className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group ${difficultyColors[level.difficulty]}`}
                >
                  <span className="text-3xl font-black">{level.id}</span>
                  {isBest && (
                    <div className="absolute top-2 right-2">
                      <Trophy className="w-3 h-3 text-amber-400" />
                    </div>
                  )}
                  <div className="text-[10px] uppercase tracking-widest font-bold opacity-60 flex flex-col items-center">
                    <span>{level.width}x{level.height}</span>
                    {isBest && <span className="text-cyan-400 mt-1">{isBest.toFixed(2)}s</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans selection:bg-cyan-500/30 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-4xl w-full flex flex-col items-center gap-8"
      >
        <div className="w-full flex justify-between items-center max-w-[672px]">
          <button 
            onClick={() => setGameState(gameMode === 'LEVEL' ? 'LEVEL_SELECT' : 'MENU')}
            className="text-slate-500 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
          >
            ← {gameMode === 'LEVEL' ? 'Levels' : 'Menu'}
          </button>
          <div className="flex gap-6 items-center">
            {(currentLevel?.hasKey || gameMode === 'QUICK') && (
              <div className={`p-2 rounded-xl border transition-all ${
                hasKey 
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                  : 'bg-slate-900/50 border-slate-800 text-slate-700'
              }`}>
                <Key className="w-4 h-4" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Timer className={`w-4 h-4 ${currentLevel?.timeLimit ? 'text-red-400' : 'text-cyan-400'}`} />
              <span className={`text-xl font-mono font-bold ${currentLevel?.timeLimit && (currentLevel.timeLimit - elapsedTime < 10) ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {currentLevel?.timeLimit 
                  ? Math.max(0, currentLevel.timeLimit - elapsedTime).toFixed(1) + 's'
                  : elapsedTime.toFixed(2) + 's'
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Move className="w-4 h-4 text-green-400" />
              <span className="text-xl font-mono font-bold text-white">
                {mazeSize.w}x{mazeSize.h}
              </span>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur opacity-20 transition duration-1000"></div>
          <div className="relative border-4 border-slate-800 rounded-xl overflow-hidden shadow-2xl bg-slate-900">
            <canvas 
              ref={canvasRef} 
              width={viewportSize.width} 
              height={viewportSize.height}
              className="block touch-none"
            />

            {/* Level Briefing Overlay */}
            <AnimatePresence>
              {showBriefing && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-8"
                >
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="max-w-xs w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-8 shadow-2xl"
                  >
                    <div className="space-y-2">
                      <h2 className="text-3xl font-black text-white tracking-tight">
                        {gameMode === 'QUICK' ? 'Quick Match' : `Level ${currentLevel?.id}`}
                      </h2>
                      {gameMode === 'LEVEL' && currentLevel && bestTimes[currentLevel.id] && (
                        <p className="text-cyan-400 text-sm font-bold">
                          Best: {bestTimes[currentLevel.id].toFixed(2)}s
                        </p>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                        <div className={`p-2 rounded-lg ${currentLevel?.hasKey || gameMode === 'QUICK' ? 'bg-amber-500/10 text-amber-400' : 'bg-green-500/10 text-green-400'}`}>
                          {currentLevel?.hasKey || gameMode === 'QUICK' ? <Key className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                        </div>
                        <div className="text-left">
                          <p className="text-white font-bold text-sm">
                            {currentLevel?.hasKey || gameMode === 'QUICK' ? 'Key Required' : 'No Key Needed'}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {currentLevel?.hasKey || gameMode === 'QUICK' ? 'Find the key before exit' : 'Head straight to the exit'}
                          </p>
                        </div>
                      </div>

                      {currentLevel?.timeLimit && (
                        <div className="flex items-center gap-4 p-4 bg-red-500/5 rounded-2xl border border-red-500/10">
                          <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
                            <Timer className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <p className="text-red-400 font-bold text-sm">Timed Escape</p>
                            <p className="text-red-400/60 text-xs">{currentLevel.timeLimit}s limit</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setShowBriefing(false);
                      }}
                      className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black hover:bg-cyan-50 transition-all active:scale-95 shadow-lg shadow-white/5"
                    >
                      OK
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Directional Compass Pulse */}
            <AnimatePresence>
              {activePulse && (
                <>
                  {activePulse.top && (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: [0, 1, 0] }} 
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2 }} 
                      className="absolute top-0 left-0 right-0 h-1.5 z-20" 
                      style={{ backgroundColor: activePulse.color, boxShadow: `0 4px 15px ${activePulse.color}` }} 
                    />
                  )}
                  {activePulse.bottom && (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: [0, 1, 0] }} 
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2 }} 
                      className="absolute bottom-0 left-0 right-0 h-1.5 z-20" 
                      style={{ backgroundColor: activePulse.color, boxShadow: `0 -4px 15px ${activePulse.color}` }} 
                    />
                  )}
                  {activePulse.left && (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: [0, 1, 0] }} 
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2 }} 
                      className="absolute top-0 bottom-0 left-0 w-1.5 z-20" 
                      style={{ backgroundColor: activePulse.color, boxShadow: `4px 0 15px ${activePulse.color}` }} 
                    />
                  )}
                  {activePulse.right && (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: [0, 1, 0] }} 
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2 }} 
                      className="absolute top-0 bottom-0 right-0 w-1.5 z-20" 
                      style={{ backgroundColor: activePulse.color, boxShadow: `-4px 0 15px ${activePulse.color}` }} 
                    />
                  )}
                </>
              )}
            </AnimatePresence>

            {/* Virtual Joystick Overlay */}
            {joystick && (
              <div 
                className="absolute pointer-events-none"
                style={{
                  left: joystick.base.x - 40,
                  top: joystick.base.y - 40,
                  width: 80,
                  height: 80,
                }}
              >
                <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30 bg-cyan-500/10 backdrop-blur-sm" />
                <div 
                  className="absolute w-8 h-8 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]"
                  style={{
                    left: 40 - 16 + (joystick.stick.x - joystick.base.x),
                    top: 40 - 16 + (joystick.stick.y - joystick.base.y),
                  }}
                />
              </div>
            )}
            
            <AnimatePresence>
              {isEscaped && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6"
                >
                  <motion.div
                    initial={{ scale: 0.8, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="flex justify-center">
                      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/30">
                        <Trophy className="w-10 h-10 text-green-400" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-4xl font-black text-white tracking-tight">VICTORY!</h2>
                      <p className="text-slate-400">You escaped the neon maze in</p>
                      <p className="text-3xl font-mono font-bold text-green-400">{elapsedTime.toFixed(3)}s</p>
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button 
                        onClick={() => { generateNewMaze(currentLevel || undefined); setShowBriefing(true); }}
                        className="group relative inline-flex items-center gap-2 px-8 py-3 bg-white text-slate-950 rounded-full font-bold hover:bg-cyan-50 transition-all active:scale-95"
                      >
                        <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                        Play Again
                      </button>
                      {gameMode === 'LEVEL' && (
                        <button 
                          onClick={() => setGameState('LEVEL_SELECT')}
                          className="px-8 py-3 bg-slate-900 text-white rounded-full font-bold border border-slate-800 hover:bg-slate-800 transition-all active:scale-95"
                        >
                          Level Select
                        </button>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {isGameOver && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-red-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6"
                >
                  <motion.div
                    initial={{ scale: 0.8, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="space-y-1">
                      <h2 className="text-4xl font-black text-white tracking-tight">SYSTEM FAILURE</h2>
                      <p className="text-red-400">The neon power has depleted.</p>
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button 
                        onClick={() => { generateNewMaze(currentLevel || undefined); setShowBriefing(true); }}
                        className="group relative inline-flex items-center gap-2 px-8 py-3 bg-white text-slate-950 rounded-full font-bold hover:bg-red-50 transition-all active:scale-95"
                      >
                        <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                        Retry Level
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-4 h-4" />
      </motion.div>
      </div>
    </ErrorBoundary>
  );
}
