/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Timer, RefreshCw, Move, Zap, Lock, Unlock, Key, LogIn, LogOut, User as UserIcon, Star, Settings, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { auth, signInWithGoogle, logout, db, onAuthStateChanged, User, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ErrorBoundary } from './components/ErrorBoundary';

import { io, Socket } from 'socket.io-client';

const TILE_SIZE = 32;
const VISION_RADIUS = 180;
const MAZE_WIDTH = 31; // Increased for better panning demo
const MAZE_HEIGHT = 31;
const PLAYER_SPEED = 5.0;
const PLAYER_COLLISION_RADIUS = 10;
const VIEWPORT_WIDTH = 640;
const VIEWPORT_HEIGHT = 480;

type Point = { x: number; y: number };
type GameMode = 'QUICK' | 'LEVEL' | 'MULTIPLAYER';
type GameState = 'MENU' | 'LEVEL_SELECT' | 'PLAYING' | 'SETTINGS' | 'MULTIPLAYER_MENU' | 'LOBBY' | 'INTERMISSION';
type ControlType = 'JOYSTICK' | 'DPAD';

interface MultiplayerPlayer {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  x: number;
  y: number;
  hasKey: boolean;
  escaped: boolean;
  placement?: number;
  eliminated: boolean;
}

interface Lobby {
  id: string;
  hostId: string;
  players: MultiplayerPlayer[];
  gameState: 'LOBBY' | 'STARTING' | 'PLAYING' | 'FINISHED';
  gameMode?: 'BEST_OF_3' | 'BATTLE_ROYALE';
  maze: number[][] | null;
  exitPos: Point | null;
  keyPos: Point | null;
  startTime: number | null;
  timeLimit?: number | null;
  round: number;
  wins: Record<string, number>;
  eliminationOrder: string[];
  lastRoundWinnerId?: string;
  lastRoundEliminatedIds?: string[];
}

interface Level {
  id: number;
  width: number;
  height: number;
  hasKey: boolean;
  timeLimit?: number;
  seed: number;
  difficulty: 'emerald' | 'amber' | 'rose' | 'void';
  starTimes: [number, number, number]; // [3 stars, 2 stars, 1 star]
  starsRequired: number;
}

const LEVELS: Level[] = [
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
  const [controlType, setControlType] = useState<ControlType>('JOYSTICK');
  const [dpadInput, setDpadInput] = useState<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false, down: false, left: false, right: false
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [lobbyIdInput, setLobbyIdInput] = useState('');
  const [spectatingId, setSpectatingId] = useState<string | null>(null);
  const [multiplayerPlayers, setMultiplayerPlayers] = useState<Record<string, MultiplayerPlayer>>({});
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [multiplayerTimeLimit, setMultiplayerTimeLimit] = useState<number | null>(null);
  const [isEarlyLeave, setIsEarlyLeave] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; message: string }[]>([]);
  const [allOpponentsQuit, setAllOpponentsQuit] = useState(false);
  const [intermission, setIntermission] = useState<{ active: boolean; countdown: number; lobby: Lobby | null }>({ active: false, countdown: 0, lobby: null });

  const getStarsForTime = (levelId: number, time: number) => {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return 0;
    if (time <= level.starTimes[0]) return 3;
    if (time <= level.starTimes[1]) return 2;
    if (time <= level.starTimes[2]) return 1;
    return 0;
  };

  const totalStars = Object.entries(bestTimes).reduce((acc, [levelId, time]) => {
    return acc + getStarsForTime(Number(levelId), time);
  }, 0);

  // Socket Connection
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("lobby_joined", (data: Lobby) => {
      setLobby(data);
      setGameState('LOBBY');
      setIsMultiplayer(true);
    });

    newSocket.on("lobby_updated", (data: Lobby) => {
      setLobby(data);
      // Sync multiplayer players if in game
      setMultiplayerPlayers(prev => {
        const newMap = { ...prev };
        const currentIds = data.players.map(p => p.id);
        Object.keys(newMap).forEach(id => {
          if (!currentIds.includes(id)) {
            delete newMap[id];
          }
        });
        return newMap;
      });
    });

    newSocket.on("game_starting", (data: { countdown: number }) => {
      setCountdown(data.countdown);
      setMaze([]);
      mazeRef.current = [];
      setAllOpponentsQuit(false);
      setIntermission({ active: false, countdown: 0, lobby: null });
      const interval = setInterval(() => {
        setCountdown(prev => (prev !== null && prev > 1) ? prev - 1 : null);
      }, 1000);
      setTimeout(() => clearInterval(interval), 3000);
    });

    newSocket.on("game_started", (data) => {
      setMaze(data.maze);
      mazeRef.current = data.maze;
      setMazeSize({ w: data.maze[0].length, h: data.maze.length });
      setExitPos(data.exitPos);
      exitRef.current = data.exitPos;
      setKeyPos(data.keyPos);
      keyRef.current = data.keyPos;
      setHasKey(false);
      hasKeyRef.current = false;
      setIsEscaped(false);
      setIsGameOver(false);
      setGameStarted(true);
      setStartTime(Date.now());
      setGameState('PLAYING');
      setGameMode('MULTIPLAYER');
      setCountdown(null);
      setMultiplayerTimeLimit(data.timeLimit || null);
      
      const playersMap: Record<string, MultiplayerPlayer> = {};
      data.players.forEach((p: MultiplayerPlayer) => {
        playersMap[p.id] = p;
      });
      setMultiplayerPlayers(playersMap);
      setPlayerPos({ x: 48, y: 48 });
      playerRef.current = { x: 48, y: 48 };
      setSpectatingId(null);
    });

    newSocket.on("player_abandoned", (data: { name: string, id: string }) => {
      console.log("Player abandoned:", data.name, data.id);
      const id = Math.random().toString(36).substring(2, 9);
      setNotifications(prev => [...prev, { id, message: `${data.name} abandoned the match` }]);
      setMultiplayerPlayers(prev => {
        const newMap = { ...prev };
        delete newMap[data.id];
        return newMap;
      });
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    });

    newSocket.on("player_escaped_notification", (data: { name: string, id: string }) => {
      const id = Math.random().toString(36).substring(2, 9);
      setNotifications(prev => [...prev, { id, message: `${data.name} escaped!` }]);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    });

    newSocket.on("round_intermission", (data: Lobby) => {
      setLobby(data);
      setGameState('INTERMISSION');
      setIntermission({ active: true, countdown: 5, lobby: data });
      const interval = setInterval(() => {
        setIntermission(prev => ({ ...prev, countdown: prev.countdown > 0 ? prev.countdown - 1 : 0 }));
      }, 1000);
      setTimeout(() => clearInterval(interval), 5000);
    });

    newSocket.on("all_opponents_quit", () => {
      setAllOpponentsQuit(true);
    });

    newSocket.on("player_moved", (data: { id: string, x: number, y: number }) => {
      setMultiplayerPlayers(prev => {
        if (!prev[data.id]) return prev;
        return {
          ...prev,
          [data.id]: { ...prev[data.id], x: data.x, y: data.y }
        };
      });
    });

    newSocket.on("player_updated", (data: MultiplayerPlayer) => {
      setMultiplayerPlayers(prev => {
        if (!prev[data.id]) return prev;
        return {
          ...prev,
          [data.id]: data
        };
      });
    });

    newSocket.on("player_eliminated", (id: string) => {
      setMultiplayerPlayers(prev => {
        if (!prev[id]) return prev;
        return {
          ...prev,
          [id]: { ...prev[id], eliminated: true }
        };
      });
    });

    newSocket.on("game_finished", (data: Lobby) => {
      setLobby(data);
      setIsEscaped(true); // Trigger end game screen
    });

    newSocket.on("error", (msg: string) => {
      alert(msg);
    });

    return () => { newSocket.close(); };
  }, []);

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

  const [activePulse, setActivePulse] = useState<{ top: boolean; bottom: boolean; left: boolean; right: boolean; color: string } | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);

  const saveBestTime = async (levelId: number, time: number) => {
    const currentBest = bestTimes[levelId];
    if (!currentBest || time < currentBest) {
      setIsNewBest(true);
      const newBestTimes = { ...bestTimes, [levelId]: time };
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
  const lastMoveEmitRef = useRef<number>(0);
  const joystickRef = useRef<{ active: boolean; base: Point; stick: Point } | null>(null);
  const dpadRef = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false, down: false, left: false, right: false
  });

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
    setIsNewBest(false);

    const startPixelPos = { x: startX * TILE_SIZE + TILE_SIZE / 2, y: startY * TILE_SIZE + TILE_SIZE / 2 };
    setPlayerPos(startPixelPos);
    playerRef.current = startPixelPos;
    setIsEscaped(false);
    setIsGameOver(false);
    setGameStarted(false);
    setElapsedTime(0);
  }, []);

  useEffect(() => {
    if (gameState === 'PLAYING' && !isMultiplayer) {
      generateNewMaze(currentLevel || undefined);
    }
  }, [gameState, currentLevel, generateNewMaze, isMultiplayer]);

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
      
      if (controlType === 'JOYSTICK') {
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
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (controlType === 'JOYSTICK' && joystickRef.current?.active) {
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
      }
    };

    const handleTouchEnd = () => {
      if (controlType === 'JOYSTICK') {
        setJoystick(null);
        joystickRef.current = null;
      }
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
    if (gameState !== 'PLAYING' || isEscaped || isGameOver || !mazeRef.current.length || showBriefing || countdown !== null) return;

    const me = isMultiplayer ? multiplayerPlayers[socket?.id || ''] : null;
    if (isMultiplayer && me && (me.escaped || me.eliminated)) {
      // Spectating logic - we don't move, just wait for draw to handle camera
      return;
    }

    if (!gameStarted && !isMultiplayer) return;

    let dx = 0;
    let dy = 0;

    // Keyboard Input
    let kdx = 0;
    let kdy = 0;
    if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) kdy -= 1;
    if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) kdy += 1;
    if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) kdx -= 1;
    if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) kdx += 1;

    if (kdx !== 0 || kdy !== 0) {
      const kdist = Math.sqrt(kdx * kdx + kdy * kdy);
      dx = (kdx / kdist) * PLAYER_SPEED;
      dy = (kdy / kdist) * PLAYER_SPEED;
    }

    // Joystick Input (Overrides keyboard if active)
    if (controlType === 'JOYSTICK' && joystickRef.current?.active) {
      const jdx = joystickRef.current.stick.x - joystickRef.current.base.x;
      const jdy = joystickRef.current.stick.y - joystickRef.current.base.y;
      const dist = Math.sqrt(jdx * jdx + jdy * jdy);
      if (dist > 0) {
        // Normalize joystick input to always provide max speed, matching keyboard behavior
        // No deadzone: any movement triggers full speed
        dx = (jdx / dist) * PLAYER_SPEED;
        dy = (jdy / dist) * PLAYER_SPEED;
      }
    }

    // D-Pad Input
    if (controlType === 'DPAD') {
      let ddx = 0;
      let ddy = 0;
      if (dpadRef.current.up) ddy -= 1;
      if (dpadRef.current.down) ddy += 1;
      if (dpadRef.current.left) ddx -= 1;
      if (dpadRef.current.right) ddx += 1;

      if (ddx !== 0 || ddy !== 0) {
        const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
        dx = (ddx / ddist) * PLAYER_SPEED;
        dy = (ddy / ddist) * PLAYER_SPEED;
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

      if (isMultiplayer && socket && lobby) {
        const now = Date.now();
        if (now - lastMoveEmitRef.current > 33) { // Throttle to ~30fps
          socket.emit('player_move', { lobbyId: lobby.id, x: nextX, y: nextY });
          lastMoveEmitRef.current = now;
        }
      }

      // Check Key Collection
      if (!hasKeyRef.current && keyRef.current) {
        const kx = keyRef.current.x * TILE_SIZE + TILE_SIZE / 2;
        const ky = keyRef.current.y * TILE_SIZE + TILE_SIZE / 2;
        const dist = Math.sqrt((nextX - kx) ** 2 + (nextY - ky) ** 2);
        if (dist < TILE_SIZE / 1.5) {
          hasKeyRef.current = true;
          setHasKey(true);
          if (isMultiplayer && socket && lobby) {
            socket.emit('player_key', { lobbyId: lobby.id });
          }
        }
      }

      // Check Exit
      const tx = Math.floor(nextX / TILE_SIZE);
      const ty = Math.floor(nextY / TILE_SIZE);
      
      if (hasKeyRef.current && tx === exitRef.current.x && ty === exitRef.current.y) {
        if (isMultiplayer && socket && lobby) {
          socket.emit('player_escaped', { lobbyId: lobby.id });
        } else {
          setIsEscaped(true);
          if (gameMode === 'LEVEL' && currentLevel) {
            saveBestTime(currentLevel.id, (Date.now() - startTime) / 1000);
          }
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
  }, [gameState, isEscaped, isGameOver, gameStarted, startTime, currentLevel, gameMode, isMultiplayer, multiplayerPlayers, socket, lobby]);

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

    const me = isMultiplayer ? multiplayerPlayers[socket?.id || ''] : null;
    let targetX = playerPos.x;
    let targetY = playerPos.y;

    if (isMultiplayer && me && (me.escaped || me.eliminated)) {
      const targetId = spectatingId || Object.keys(multiplayerPlayers).find(id => !multiplayerPlayers[id].escaped && !multiplayerPlayers[id].eliminated);
      const target = targetId ? multiplayerPlayers[targetId] : me;
      targetX = target.x;
      targetY = target.y;
    }

    // Calculate Camera Position (Centered on target, clamped to maze bounds)
    const camX = Math.max(0, Math.min(targetX - viewportSize.width / 2, mazeSize.w * TILE_SIZE - viewportSize.width));
    const camY = Math.max(0, Math.min(targetY - viewportSize.height / 2, mazeSize.h * TILE_SIZE - viewportSize.height));

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

    // Draw Other Players
    if (isMultiplayer) {
      Object.values(multiplayerPlayers).forEach(p => {
        if (p.id === socket?.id || p.escaped || p.eliminated) return;
        
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, TILE_SIZE / 2.8, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw Name
        // Names removed as requested
        ctx.restore();
      });
    }

    // Draw Player
    const isMeActive = !isMultiplayer || (me && !me.escaped && !me.eliminated);
    if (isMeActive) {
      const px = playerPos.x;
      const py = playerPos.y;
      ctx.save();
      const playerColor = isMultiplayer ? (me?.color || '#06b6d4') : '#06b6d4';
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
        ctx.shadowColor = playerColor;
      }
      ctx.fillStyle = playerColor;
      ctx.beginPath();
      ctx.arc(px, py, TILE_SIZE / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // End of translated maze drawing

    // Fog of War (Drawn on top of everything, but relative to screen)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.fillStyle = 'rgba(2, 6, 23, 0.98)';
    tempCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Player position relative to viewport
    targetX = isMultiplayer && spectatingId && multiplayerPlayers[spectatingId] 
      ? multiplayerPlayers[spectatingId].x 
      : playerPos.x;
    targetY = isMultiplayer && spectatingId && multiplayerPlayers[spectatingId] 
      ? multiplayerPlayers[spectatingId].y 
      : playerPos.y;

    const screenX = targetX - camX;
    const screenY = targetY - camY;

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

  }, [gameState, playerPos, maze, exitPos, hasKey, keyPos, viewportSize, isMultiplayer, multiplayerPlayers, socket, spectatingId]);

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
              onClick={() => setGameState('MULTIPLAYER_MENU')}
              className="group relative px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xl border border-slate-800 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              <UserIcon className="w-5 h-5 text-cyan-400" />
              Multiplayer
            </button>

            <button 
              onClick={() => setGameState('SETTINGS')}
              className="group relative px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xl border border-slate-800 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              <Settings className="w-5 h-5 text-slate-400 group-hover:rotate-90 transition-transform duration-500" />
              Settings
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (gameState === 'MULTIPLAYER_MENU') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans">
        <div className="max-w-2xl w-full space-y-12">
          <div className="space-y-2">
            <button 
              onClick={() => setGameState('MENU')}
              className="text-slate-500 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
            >
              ← Back to Menu
            </button>
            <h1 className="text-5xl font-black tracking-tighter text-white">MULTIPLAYER</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-[2rem] space-y-6">
              <div className="w-12 h-12 bg-cyan-500/20 rounded-2xl flex items-center justify-center border border-cyan-500/30">
                <Zap className="w-6 h-6 text-cyan-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Host Game</h2>
                <p className="text-slate-400 text-sm">Create a private lobby and invite your friends to compete.</p>
              </div>
              <button 
                onClick={() => socket?.emit('host_lobby', { name: user?.displayName || 'Player' })}
                className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-black hover:bg-cyan-400 transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
              >
                Create Lobby
              </button>
            </div>

            <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-[2rem] space-y-6">
              <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center border border-purple-500/30">
                <Key className="w-6 h-6 text-purple-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Join Game</h2>
                <p className="text-slate-400 text-sm">Enter a session key to join an existing private lobby.</p>
              </div>
              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Enter Session Key"
                  value={lobbyIdInput}
                  onChange={(e) => setLobbyIdInput(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 outline-none transition-colors"
                />
                <button 
                  onClick={() => socket?.emit('join_lobby', { lobbyId: lobbyIdInput, name: user?.displayName || 'Player' })}
                  className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black hover:bg-slate-700 transition-all active:scale-95"
                >
                  Join Lobby
                </button>
              </div>
            </div>

            <div className="md:col-span-2 p-8 bg-slate-900/30 border border-slate-800/50 border-dashed rounded-[2rem] flex flex-col items-center justify-center text-center space-y-4 opacity-60">
              <div className="w-12 h-12 bg-slate-800/50 rounded-2xl flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-slate-500" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-400">Quick Match</h2>
                <p className="text-slate-500 text-sm italic">Coming Soon</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'LOBBY' && lobby) {
    const isHost = lobby.hostId === socket?.id;
    const me = lobby.players.find(p => p.id === socket?.id);

    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans">
        <div className="max-w-4xl w-full space-y-12">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <button 
                onClick={() => { 
                  socket?.emit('leave_lobby', { lobbyId: lobby.id }); 
                  setLobby(null);
                  setIsMultiplayer(false);
                  setIsEscaped(false);
                  setIsGameOver(false);
                  setGameState('MULTIPLAYER_MENU'); 
                }}
                className="text-slate-500 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
              >
                ← Leave Lobby
              </button>
              <h1 className="text-5xl font-black tracking-tighter text-white flex items-center gap-4">
                LOBBY
                <span className="px-4 py-1 bg-slate-900 border border-slate-800 rounded-xl text-2xl font-mono text-cyan-400">
                  {lobby.id}
                </span>
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                Players ({lobby.players.length}/6)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {lobby.players.map((p) => (
                  <div key={p.id} className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-10 h-10 rounded-full border-2 border-white/10 shadow-lg"
                        style={{ backgroundColor: p.color, boxShadow: `0 0 20px ${p.color}40` }}
                      />
                      <div className="space-y-0.5">
                        <p className="font-bold text-white flex items-center gap-2">
                          {p.name}
                          {p.id === lobby.hostId && <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-md border border-cyan-500/30">HOST</span>}
                        </p>
                        <p className="text-xs text-slate-500 font-medium">
                          {p.ready ? 'READY' : 'WAITING...'}
                        </p>
                      </div>
                    </div>
                    {p.ready && <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <section className="space-y-4">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Your Color</h2>
                <div className="grid grid-cols-3 gap-3">
                  {['#22d3ee', '#fbbf24', '#f43f5e', '#10b981', '#a855f7', '#f97316'].map((c) => {
                    const isTaken = lobby.players.some(p => p.color === c && p.id !== socket?.id);
                    return (
                      <button
                        key={c}
                        disabled={isTaken}
                        onClick={() => socket?.emit('change_color', { lobbyId: lobby.id, color: c })}
                        className={`aspect-square rounded-2xl border-2 transition-all flex items-center justify-center ${
                          me?.color === c 
                            ? 'border-white scale-110 shadow-xl' 
                            : isTaken 
                              ? 'border-transparent opacity-20 cursor-not-allowed' 
                              : 'border-white/5 hover:border-white/20'
                        }`}
                        style={{ backgroundColor: c }}
                      >
                        {me?.color === c && <div className="w-2 h-2 rounded-full bg-white" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="pt-8 border-t border-slate-800 space-y-4">
                <button 
                  onClick={() => socket?.emit('ready_up', { lobbyId: lobby.id, ready: !me?.ready })}
                  className={`w-full py-6 rounded-[2rem] font-black text-xl transition-all active:scale-95 shadow-2xl ${
                    me?.ready 
                      ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                      : 'bg-white text-slate-950 hover:bg-cyan-50'
                  }`}
                >
                  {me?.ready ? 'UNREADY' : 'READY UP'}
                </button>
                {lobby.players.length < 2 && (
                  <p className="text-center text-xs text-slate-500 font-medium animate-pulse">
                    Waiting for at least 2 players...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'SETTINGS') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans">
        <div className="max-w-2xl w-full space-y-12">
          <div className="space-y-2">
            <button 
              onClick={() => setGameState('MENU')}
              className="text-slate-500 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
            >
              ← Back to Menu
            </button>
            <h1 className="text-5xl font-black tracking-tighter text-white">SETTINGS</h1>
          </div>

          <div className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Mobile Controls</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setControlType('JOYSTICK')}
                  className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-4 ${
                    controlType === 'JOYSTICK' 
                      ? 'border-cyan-500 bg-cyan-500/10 text-white' 
                      : 'border-slate-800 bg-slate-900/50 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full border-2 border-current flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
                  </div>
                  <span className="font-bold">Joystick</span>
                </button>
                <button
                  onClick={() => setControlType('DPAD')}
                  className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-4 ${
                    controlType === 'DPAD' 
                      ? 'border-cyan-500 bg-cyan-500/10 text-white' 
                      : 'border-slate-800 bg-slate-900/50 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  <div className="grid grid-cols-3 gap-1">
                    <div className="w-4 h-4" />
                    <div className="w-4 h-4 bg-current rounded-sm" />
                    <div className="w-4 h-4" />
                    <div className="w-4 h-4 bg-current rounded-sm" />
                    <div className="w-4 h-4 bg-current rounded-sm" />
                    <div className="w-4 h-4 bg-current rounded-sm" />
                    <div className="w-4 h-4" />
                    <div className="w-4 h-4 bg-current rounded-sm" />
                    <div className="w-4 h-4" />
                  </div>
                  <span className="font-bold">D-Pad</span>
                </button>
              </div>
            </section>
          </div>
        </div>
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
            <div className="text-right flex items-center gap-6">
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-widest">Stars</p>
                <p className="text-2xl font-mono font-bold text-amber-400 flex items-center gap-2">
                  <Star className="w-5 h-5 fill-amber-400" />
                  {totalStars}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-widest">Progression</p>
                <p className="text-2xl font-mono font-bold text-cyan-400">
                  {Object.keys(bestTimes).length}/{LEVELS.length}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {LEVELS.map((level) => {
              const isBest = bestTimes[level.id];
              const isLocked = totalStars < level.starsRequired;
              const difficultyColors = {
                emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10',
                amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10',
                rose: 'border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10',
                void: 'border-purple-500/30 bg-purple-500/5 text-purple-400 hover:bg-purple-500/10',
              };

              if (isLocked) {
                const diffBorders = {
                  emerald: 'border-emerald-500/50 bg-slate-900/50',
                  amber: 'border-amber-500/50 bg-slate-900/50',
                  rose: 'border-rose-500/50 bg-slate-900/50',
                  void: 'border-purple-500/50 bg-slate-900/50',
                };
                return (
                  <div
                    key={level.id}
                    className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-2 ${diffBorders[level.difficulty]}`}
                  >
                    <div className="flex flex-col items-center justify-center gap-2 grayscale opacity-60">
                      <Lock className="w-8 h-8 text-slate-700" />
                      <div className="flex items-center gap-1 text-slate-500 font-bold text-xs">
                        <Star className="w-3 h-3 fill-slate-700 text-slate-700" />
                        {level.starsRequired}
                      </div>
                    </div>
                    <span className="text-slate-800 font-black absolute top-2 left-3 opacity-40">{level.id}</span>
                  </div>
                );
              }

              return (
                <button
                  key={level.id}
                  onClick={() => { setGameMode('LEVEL'); setCurrentLevel(level); setGameState('PLAYING'); setShowBriefing(true); }}
                  className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group ${difficultyColors[level.difficulty]}`}
                >
                  <span className="text-3xl font-black">{level.id}</span>
                  {isBest && (
                    <>
                      <div className="absolute top-2 right-2">
                        <Trophy className="w-3 h-3 text-amber-400" />
                      </div>
                      <div className="absolute top-6 right-2 flex flex-col gap-0.5">
                        {[...Array(3)].map((_, i) => {
                          const stars = getStarsForTime(level.id, isBest);
                          return (
                            <Star 
                              key={i} 
                              className={`w-2 h-2 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-slate-800'}`} 
                            />
                          );
                        })}
                      </div>
                    </>
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
          <div className="flex gap-6 items-center select-none">
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
              <Timer className={`w-4 h-4 ${currentLevel?.timeLimit || multiplayerTimeLimit ? 'text-red-400' : 'text-cyan-400'}`} />
              <span className={`text-xl font-mono font-bold ${(currentLevel?.timeLimit && (currentLevel.timeLimit - elapsedTime < 10)) || (multiplayerTimeLimit && (multiplayerTimeLimit - elapsedTime < 10)) ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {currentLevel?.timeLimit 
                  ? Math.max(0, currentLevel.timeLimit - elapsedTime).toFixed(1) + 's'
                  : multiplayerTimeLimit
                  ? Math.max(0, multiplayerTimeLimit - elapsedTime).toFixed(1) + 's'
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
          <div className="relative border-4 border-slate-800 rounded-xl overflow-hidden shadow-2xl bg-slate-900 select-none touch-none">
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

            {/* Countdown Overlay */}
            {/* Countdown moved below canvas */}

            {/* Players Left Overlay */}
            {isMultiplayer && lobby?.gameMode === 'BATTLE_ROYALE' && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 z-40 flex items-center gap-3">
                <UserIcon className="w-5 h-5 text-cyan-400" />
                <span className="text-sm font-bold text-white">
                  {Object.values(multiplayerPlayers).filter(p => !p.eliminated && !p.escaped).length} Left
                </span>
              </div>
            )}

            {/* Spectator Controls */}
            {isMultiplayer && multiplayerPlayers[socket?.id || ''] && (multiplayerPlayers[socket?.id || ''].escaped || multiplayerPlayers[socket?.id || ''].eliminated) && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 z-40">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Spectating</span>
                <div className="flex items-center gap-2">
                  {Object.values(multiplayerPlayers).filter(p => !p.escaped && !p.eliminated).map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSpectatingId(p.id)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        spectatingId === p.id ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: p.color }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => {
                    setIsEarlyLeave(true);
                    setIsEscaped(true);
                  }}
                  className="ml-4 px-4 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-bold transition-colors"
                >
                  LEAVE GAME
                </button>
              </div>
            )}

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
            {controlType === 'JOYSTICK' && joystick && (
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

            {/* D-Pad Overlay - Fixed to bottom of screen for ergonomics */}
            {controlType === 'DPAD' && (
              <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-auto select-none">
                <div className="flex justify-center">
                  <button
                    onPointerDown={() => { dpadRef.current.up = true; setDpadInput(prev => ({ ...prev, up: true })); if(!gameStarted) { setGameStarted(true); setStartTime(Date.now()); } }}
                    onPointerUp={() => { dpadRef.current.up = false; setDpadInput(prev => ({ ...prev, up: false })); }}
                    onPointerLeave={() => { dpadRef.current.up = false; setDpadInput(prev => ({ ...prev, up: false })); }}
                    className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all backdrop-blur-md ${dpadInput.up ? 'bg-cyan-500/40 border-cyan-400 scale-90 shadow-[0_0_25px_rgba(6,182,212,0.4)]' : 'bg-slate-950/20 border-slate-700/30'}`}
                  >
                    <ChevronUp className={`w-12 h-12 ${dpadInput.up ? 'text-white' : 'text-slate-400/40'}`} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onPointerDown={() => { dpadRef.current.left = true; setDpadInput(prev => ({ ...prev, left: true })); if(!gameStarted) { setGameStarted(true); setStartTime(Date.now()); } }}
                    onPointerUp={() => { dpadRef.current.left = false; setDpadInput(prev => ({ ...prev, left: false })); }}
                    onPointerLeave={() => { dpadRef.current.left = false; setDpadInput(prev => ({ ...prev, left: false })); }}
                    className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all backdrop-blur-md ${dpadInput.left ? 'bg-cyan-500/40 border-cyan-400 scale-90 shadow-[0_0_25px_rgba(6,182,212,0.4)]' : 'bg-slate-950/20 border-slate-700/30'}`}
                  >
                    <ChevronLeft className={`w-12 h-12 ${dpadInput.left ? 'text-white' : 'text-slate-400/40'}`} />
                  </button>
                  <div className="w-20 h-20 rounded-2xl bg-slate-950/5 border-2 border-slate-800/20 flex items-center justify-center backdrop-blur-[2px]">
                    <div className="w-3 h-3 rounded-full bg-slate-700/20" />
                  </div>
                  <button
                    onPointerDown={() => { dpadRef.current.right = true; setDpadInput(prev => ({ ...prev, right: true })); if(!gameStarted) { setGameStarted(true); setStartTime(Date.now()); } }}
                    onPointerUp={() => { dpadRef.current.right = false; setDpadInput(prev => ({ ...prev, right: false })); }}
                    onPointerLeave={() => { dpadRef.current.right = false; setDpadInput(prev => ({ ...prev, right: false })); }}
                    className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all backdrop-blur-md ${dpadInput.right ? 'bg-cyan-500/40 border-cyan-400 scale-90 shadow-[0_0_25px_rgba(6,182,212,0.4)]' : 'bg-slate-900/20 border-slate-700/30'}`}
                  >
                    <ChevronRight className={`w-12 h-12 ${dpadInput.right ? 'text-white' : 'text-slate-400/40'}`} />
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    onPointerDown={() => { dpadRef.current.down = true; setDpadInput(prev => ({ ...prev, down: true })); if(!gameStarted) { setGameStarted(true); setStartTime(Date.now()); } }}
                    onPointerUp={() => { dpadRef.current.down = false; setDpadInput(prev => ({ ...prev, down: false })); }}
                    onPointerLeave={() => { dpadRef.current.down = false; setDpadInput(prev => ({ ...prev, down: false })); }}
                    className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all backdrop-blur-md ${dpadInput.down ? 'bg-cyan-500/40 border-cyan-400 scale-90 shadow-[0_0_25px_rgba(6,182,212,0.4)]' : 'bg-slate-950/20 border-slate-700/30'}`}
                  >
                    <ChevronDown className={`w-12 h-12 ${dpadInput.down ? 'text-white' : 'text-slate-400/40'}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Countdown and Notifications below canvas */}
        <div className="mt-6 flex flex-col items-center gap-4 min-h-[100px]">
          <AnimatePresence mode="wait">
            {countdown !== null && (
              <motion.div 
                key="countdown"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-4 bg-cyan-500/10 px-8 py-3 rounded-2xl border border-cyan-500/20"
              >
                <Zap className="w-6 h-6 text-cyan-400 animate-pulse" />
                <span className="text-2xl font-black text-white italic tracking-tight">
                  STARTING IN <span className="text-cyan-400 text-4xl ml-2">{countdown}</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className="flex flex-col items-center gap-2">
            <AnimatePresence>
              {notifications.map(n => (
                <motion.div 
                  key={n.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 px-5 py-2 rounded-2xl text-sm font-bold text-slate-400 flex items-center gap-3 shadow-xl"
                >
                  <UserIcon className="w-4 h-4 text-rose-500" />
                  <span>{n.message}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-4 h-4" />
      </motion.div>

      <AnimatePresence>
        {((!isMultiplayer && (isEscaped || isGameOver)) || (isMultiplayer && (isGameOver || gameState === 'INTERMISSION'))) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.9, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className={`max-w-md w-full bg-slate-900 border rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden ${(!isMultiplayer && isGameOver) ? 'border-red-900/30' : 'border-slate-800'}`}
            >
              {/* Decorative background glow */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 blur-[100px]" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/10 blur-[100px]" />

              {gameState === 'INTERMISSION' && isMultiplayer && lobby ? (
                <>
                  {(() => {
                    const me = lobby.players.find(p => p.id === socket?.id);
                    
                    if (lobby.gameMode === 'BEST_OF_3') {
                      const opponent = lobby.players.find(p => p.id !== socket?.id);
                      const iWonRound = lobby.lastRoundWinnerId === me?.id;
                      const myWins = lobby.wins[me?.id || ''] || 0;
                      const oppWins = lobby.wins[opponent?.id || ''] || 0;

                      return (
                        <>
                          <div className="flex justify-center relative">
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center border ${
                              iWonRound ? 'bg-green-500/20 border-green-500/30' : 'bg-red-500/20 border-red-500/30'
                            }`}>
                              {iWonRound ? <Trophy className="w-12 h-12 text-green-400" /> : <Zap className="w-12 h-12 text-red-400" />}
                            </div>
                          </div>

                          <div className="space-y-2 text-center relative">
                            <h2 className={`text-5xl font-black tracking-tight ${iWonRound ? 'text-green-400' : 'text-red-400'}`}>
                              {iWonRound ? 'ROUND WON' : 'ROUND LOSS'}
                            </h2>
                            <div className="flex items-center justify-center gap-4 mt-4 text-3xl font-black">
                              <span className="text-green-400">{myWins}</span>
                              <span className="text-slate-500">-</span>
                              <span className="text-red-400">{oppWins}</span>
                            </div>
                            <p className="text-slate-400 font-medium mt-6">
                              Next round starting soon
                            </p>
                            <p className="text-4xl font-mono font-bold text-white mt-2">
                              {intermission.countdown}
                            </p>
                          </div>
                        </>
                      );
                    } else {
                      // BATTLE_ROYALE
                      const eliminatedIds = lobby.lastRoundEliminatedIds || [];
                      const iAmEliminated = eliminatedIds.includes(me?.id || '');
                      const eliminatedNames = eliminatedIds.map(id => lobby.players.find(p => p.id === id)?.name).join(', ');
                      const remainingPlayers = lobby.players.filter(p => !p.eliminated);

                      return (
                        <>
                          <div className="flex justify-center relative">
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center border ${
                              !iAmEliminated ? 'bg-green-500/20 border-green-500/30' : 'bg-red-500/20 border-red-500/30'
                            }`}>
                              {!iAmEliminated ? <Trophy className="w-12 h-12 text-green-400" /> : <Zap className="w-12 h-12 text-red-400" />}
                            </div>
                          </div>

                          <div className="space-y-2 text-center relative">
                            <h2 className={`text-5xl font-black tracking-tight ${!iAmEliminated ? 'text-green-400' : 'text-red-400'}`}>
                              {!iAmEliminated ? 'YOU SURVIVED' : 'ELIMINATED'}
                            </h2>
                            <p className="text-slate-400 font-medium">
                              {!iAmEliminated ? `${eliminatedNames} was eliminated` : 'Opponents found the exit first'}
                            </p>
                            
                            <div className="mt-6 bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Remaining Players</h3>
                              <div className="flex flex-wrap justify-center gap-2">
                                {remainingPlayers.map(p => (
                                  <div key={p.id} className="px-3 py-1 rounded-lg bg-slate-800 text-white text-sm font-medium flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                    {p.name}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <p className="text-slate-400 font-medium mt-6">
                              {iAmEliminated ? 'Spectating in' : 'Next round starting soon'}
                            </p>
                            <p className="text-4xl font-mono font-bold text-white mt-2">
                              {intermission.countdown}
                            </p>
                          </div>
                        </>
                      );
                    }
                  })()}
                </>
              ) : isMultiplayer && lobby ? (
                <>
                  {(() => {
                    const me = lobby.players.find(p => p.id === socket?.id);
                    const isWinner = lobby.gameMode === 'BATTLE_ROYALE'
                      ? (!me?.eliminated && lobby.players.filter(p => !p.eliminated).length === 1)
                      : (lobby.wins[me?.id || ''] === 2);
                    const isEliminated = me?.eliminated;

                    return (
                      <>
                        <div className="flex justify-center relative">
                          <div className={`w-24 h-24 rounded-full flex items-center justify-center border ${
                            isWinner ? 'bg-green-500/20 border-green-500/30' : 'bg-red-500/20 border-red-500/30'
                          }`}>
                            {isWinner ? <Trophy className="w-12 h-12 text-green-400" /> : <Zap className="w-12 h-12 text-red-400" />}
                          </div>
                        </div>

                        <div className="space-y-2 text-center relative">
                          <h2 className={`text-5xl font-black tracking-tight ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
                            {isWinner ? 'VICTORY!' : isEliminated ? 'ELIMINATED' : 'DEFEAT'}
                          </h2>
                          <p className="text-slate-400 font-medium">
                            {allOpponentsQuit ? 'All opponents quit' : isWinner ? 'You are the champion!' : isEliminated ? 'Better luck next time.' : 'You lost the match.'}
                          </p>
                          {me?.placement && lobby.gameMode !== 'BEST_OF_3' && (
                            <p className="text-2xl font-mono font-bold text-white mt-4">
                              Placement: #{me.placement}
                            </p>
                          )}
                        </div>

                        <div className="space-y-4 pt-8">
                          {isEarlyLeave ? (
                            <button 
                              onClick={() => {
                                socket?.emit('leave_lobby', { lobbyId: lobby.id });
                                setIsEscaped(false);
                                setIsEarlyLeave(false);
                                setGameState('MULTIPLAYER_MENU');
                              }}
                              className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black hover:bg-cyan-50 transition-all active:scale-95"
                            >
                              OK
                            </button>
                          ) : (
                            <>
                              <button 
                                onClick={() => {
                                  setIsEscaped(false);
                                  setIsGameOver(false);
                                  setGameState('LOBBY');
                                }}
                                className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black hover:bg-cyan-50 transition-all active:scale-95"
                              >
                                BACK TO LOBBY
                              </button>
                              <button 
                                onClick={() => {
                                  socket?.emit('leave_lobby', { lobbyId: lobby.id });
                                  setIsEscaped(false);
                                  setIsGameOver(false);
                                  setGameState('MULTIPLAYER_MENU');
                                }}
                                className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black hover:bg-slate-700 transition-all active:scale-95"
                              >
                                LEAVE GAME
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : !isMultiplayer && isEscaped ? (
                <>
                  <div className="flex justify-center relative">
                    <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/30">
                      <Trophy className="w-12 h-12 text-green-400" />
                    </div>
                  </div>

                  <div className="space-y-2 text-center relative">
                    <h2 className="text-5xl font-black text-white tracking-tight">VICTORY!</h2>
                    <p className="text-slate-400 font-medium">You escaped the neon maze in</p>
                    <p className="text-4xl font-mono font-bold text-green-400">{elapsedTime.toFixed(3)}s</p>
                    
                    {gameMode === 'LEVEL' && currentLevel && (
                      <div className="mt-8 space-y-6">
                        <div className="flex justify-center gap-3">
                          {[...Array(3)].map((_, i) => {
                            const stars = getStarsForTime(currentLevel.id, elapsedTime);
                            return (
                              <motion.div
                                key={i}
                                initial={{ scale: 0, rotate: -45 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
                              >
                                <Star 
                                  className={`w-12 h-12 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-slate-800'}`} 
                                />
                              </motion.div>
                            );
                          })}
                        </div>
                        
                        <div className="flex flex-col items-center gap-4">
                          {getStarsForTime(currentLevel.id, elapsedTime) < 3 && (
                            <div className="text-sm font-bold text-slate-500 flex items-center gap-2 bg-slate-950/50 px-4 py-2 rounded-full border border-slate-800">
                              <Star className="w-3 h-3 fill-slate-600" />
                              Next Star: {currentLevel.starTimes[2 - getStarsForTime(currentLevel.id, elapsedTime)].toFixed(1)}s
                            </div>
                          )}

                          {isNewBest && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 1.2, type: "spring" }}
                              className="px-8 py-3 bg-cyan-500 text-white text-base font-black rounded-full tracking-widest uppercase shadow-[0_0_30px_rgba(6,182,212,0.6)]"
                            >
                              New Best Time!
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 relative pt-4">
                    <button 
                      onClick={() => { generateNewMaze(currentLevel || undefined); setShowBriefing(true); }}
                      className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-white text-slate-950 rounded-2xl font-bold text-lg hover:bg-cyan-50 transition-all active:scale-95 shadow-lg"
                    >
                      <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                      Play Again
                    </button>
                    {gameMode === 'LEVEL' && (
                      <button 
                        onClick={() => setGameState('LEVEL_SELECT')}
                        className="px-8 py-4 bg-slate-800 text-white rounded-2xl font-bold text-lg border border-slate-700 hover:bg-slate-700 transition-all active:scale-95"
                      >
                        Level Select
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2 text-center">
                    <h2 className="text-5xl font-black text-white tracking-tight">SYSTEM FAILURE</h2>
                    <p className="text-red-400 font-medium">The neon power has depleted.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => { generateNewMaze(currentLevel || undefined); setShowBriefing(true); }}
                      className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-white text-slate-950 rounded-2xl font-bold text-lg hover:bg-red-50 transition-all active:scale-95 shadow-lg"
                    >
                      <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                      Retry Level
                    </button>
                    <button 
                      onClick={() => setGameState('LEVEL_SELECT')}
                      className="px-8 py-4 bg-slate-800 text-white rounded-2xl font-bold text-lg border border-slate-700 hover:bg-slate-700 transition-all active:scale-95"
                    >
                      Level Select
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
