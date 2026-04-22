import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../../api';
import { getCurrentUserIdToken, logout, signInWithGoogle } from '../../firebase';
import type {
  ClientToServerEvents,
  Lobby,
  MultiplayerPlayer,
  ServerToClientEvents,
} from '../../multiplayer/contracts';
import { PLAYER_COLORS } from '../../multiplayer/contracts';
import { useAuthSession } from '../auth/hooks/useAuthSession';
import {
  PLAYER_COLLISION_RADIUS,
  PLAYER_SPEED,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  VISION_RADIUS,
} from '../gameplay/constants';
import { createMazeRun } from '../gameplay/lib/maze';
import type {
  ControlType,
  GameMode,
  GameState,
  IntermissionState,
  Level,
  Notification,
  Point,
} from '../gameplay/types';
import { usePlayerProgress } from '../progress/hooks/usePlayerProgress';

type MazeySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function useMazeyAppState() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { user, isAuthLoading } = useAuthSession();
  const userId = user?.uid ?? null;
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
  const [gameStarted, setGameStarted] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
  });
  const [joystick, setJoystick] = useState<{
    active: boolean;
    base: Point;
    stick: Point;
  } | null>(null);
  const [controlType, setControlType] = useState<ControlType>('JOYSTICK');
  const [dpadInput, setDpadInput] = useState({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const [socket, setSocket] = useState<MazeySocket | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [lobbyIdInput, setLobbyIdInput] = useState('');
  const [spectatingId, setSpectatingId] = useState<string | null>(null);
  const [multiplayerPlayers, setMultiplayerPlayers] = useState<
    Record<string, MultiplayerPlayer>
  >({});
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [multiplayerTimeLimit, setMultiplayerTimeLimit] = useState<number | null>(
    null,
  );
  const [isEarlyLeave, setIsEarlyLeave] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [allOpponentsQuit, setAllOpponentsQuit] = useState(false);
  const [intermission, setIntermission] = useState<IntermissionState<Lobby>>({
    active: false,
    countdown: 0,
    lobby: null,
  });
  const [activePulse, setActivePulse] = useState<{
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
    color: string;
  } | null>(null);

  const {
    bestTimes,
    isNewBest,
    setIsNewBest,
    totalStars,
    getStarsForTime,
    saveBestTime,
  } = usePlayerProgress(user, isAuthLoading);

  const playerRef = useRef<Point>({ x: 0, y: 0 });
  const keysPressed = useRef<Set<string>>(new Set());
  const requestRef = useRef<number | null>(null);
  const mazeRef = useRef<number[][]>([]);
  const exitRef = useRef<Point>({ x: 0, y: 0 });
  const keyRef = useRef<Point | null>(null);
  const hasKeyRef = useRef<boolean>(false);
  const lastMoveEmitRef = useRef<number>(0);
  const joystickRef = useRef<{
    active: boolean;
    base: Point;
    stick: Point;
  } | null>(null);
  const dpadRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
  });

  const generateNewMaze = useCallback((level?: Level) => {
    const nextRun = createMazeRun(level);
    setMazeSize(nextRun.mazeSize);
    setMaze(nextRun.maze);
    mazeRef.current = nextRun.maze;
    setExitPos(nextRun.exitPos);
    exitRef.current = nextRun.exitPos;
    setKeyPos(nextRun.keyPos);
    keyRef.current = nextRun.keyPos;
    setHasKey(nextRun.hasKeyInitially);
    hasKeyRef.current = nextRun.hasKeyInitially;
    setIsNewBest(false);
    setPlayerPos(nextRun.startPixelPos);
    playerRef.current = nextRun.startPixelPos;
    setIsEscaped(false);
    setIsGameOver(false);
    setGameStarted(false);
    setElapsedTime(0);
    setStartTime(0);
  }, [setIsNewBest]);

  const startQuickPlay = useCallback(() => {
    setGameMode('QUICK');
    setCurrentLevel(null);
    setIsMultiplayer(false);
    setGameState('PLAYING');
    setShowBriefing(true);
    setCountdown(null);
    setIntermission({ active: false, countdown: 0, lobby: null });
  }, []);

  const startLevelRun = useCallback((level: Level) => {
    setGameMode('LEVEL');
    setCurrentLevel(level);
    setIsMultiplayer(false);
    setGameState('PLAYING');
    setShowBriefing(true);
    setCountdown(null);
    setIntermission({ active: false, countdown: 0, lobby: null });
  }, []);

  const restartCurrentRun = useCallback(() => {
    generateNewMaze(currentLevel ?? undefined);
    setShowBriefing(true);
  }, [currentLevel, generateNewMaze]);

  useEffect(() => {
    if (isAuthLoading || !userId) {
      setSocket(null);
      return;
    }

    let cancelled = false;
    let newSocket: MazeySocket | null = null;

    const connectSocket = async () => {
      try {
        const idToken = await getCurrentUserIdToken();

        if (cancelled) {
          return;
        }

        newSocket = io(SOCKET_URL, {
          auth: {
            token: idToken,
          },
          ...(import.meta.env.DEV ? { transports: ['websocket'] as const } : {}),
        });
        setSocket(newSocket);

        newSocket.on('lobby_joined', (data: Lobby) => {
          setLobby(data);
          setGameState('LOBBY');
          setIsMultiplayer(true);
        });

        newSocket.on('lobby_updated', (data: Lobby) => {
          setLobby(data);
          setMultiplayerPlayers((prev) => {
            const nextMap = { ...prev };
            const currentIds = data.players.map((player) => player.id);

            Object.keys(nextMap).forEach((id) => {
              if (!currentIds.includes(id)) {
                delete nextMap[id];
              }
            });

            return nextMap;
          });
        });

        newSocket.on('game_starting', (data) => {
          setCountdown(data.countdown);
          setMaze([]);
          mazeRef.current = [];
          setAllOpponentsQuit(false);
          setIntermission({ active: false, countdown: 0, lobby: null });
          const interval = window.setInterval(() => {
            setCountdown((prev) =>
              prev !== null && prev > 1 ? prev - 1 : null,
            );
          }, 1000);
          window.setTimeout(() => clearInterval(interval), 3000);
        });

        newSocket.on('game_started', (data) => {
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
          data.players.forEach((player: MultiplayerPlayer) => {
            playersMap[player.id] = player;
          });

          setMultiplayerPlayers(playersMap);
          setPlayerPos({ x: 48, y: 48 });
          playerRef.current = { x: 48, y: 48 };
          setSpectatingId(null);
        });

        newSocket.on('player_abandoned', (data) => {
          const id = Math.random().toString(36).substring(2, 9);
          setNotifications((prev) => [
            ...prev,
            { id, message: `${data.name} abandoned the match` },
          ]);
          setMultiplayerPlayers((prev) => {
            const nextMap = { ...prev };
            delete nextMap[data.id];
            return nextMap;
          });
          window.setTimeout(() => {
            setNotifications((prev) => prev.filter((notification) => notification.id !== id));
          }, 5000);
        });

        newSocket.on('player_escaped_notification', (data) => {
          const id = Math.random().toString(36).substring(2, 9);
          setNotifications((prev) => [
            ...prev,
            { id, message: `${data.name} escaped!` },
          ]);
          window.setTimeout(() => {
            setNotifications((prev) => prev.filter((notification) => notification.id !== id));
          }, 5000);
        });

        newSocket.on('round_intermission', (data: Lobby) => {
          setLobby(data);
          setGameState('INTERMISSION');
          setIntermission({ active: true, countdown: 5, lobby: data });
          const interval = window.setInterval(() => {
            setIntermission((prev) => ({
              ...prev,
              countdown: prev.countdown > 0 ? prev.countdown - 1 : 0,
            }));
          }, 1000);
          window.setTimeout(() => clearInterval(interval), 5000);
        });

        newSocket.on('all_opponents_quit', () => {
          setAllOpponentsQuit(true);
        });

        newSocket.on('player_moved', (data) => {
          setMultiplayerPlayers((prev) => {
            if (!prev[data.id]) {
              return prev;
            }

            return {
              ...prev,
              [data.id]: { ...prev[data.id], x: data.x, y: data.y },
            };
          });
        });

        newSocket.on('player_updated', (data: MultiplayerPlayer) => {
          setMultiplayerPlayers((prev) => {
            if (!prev[data.id]) {
              return prev;
            }

            return {
              ...prev,
              [data.id]: data,
            };
          });
        });

        newSocket.on('player_eliminated', (id: string) => {
          setMultiplayerPlayers((prev) => {
            if (!prev[id]) {
              return prev;
            }

            return {
              ...prev,
              [id]: { ...prev[id], eliminated: true },
            };
          });
        });

        newSocket.on('game_finished', (data: Lobby) => {
          setLobby(data);
          setIsEscaped(true);
        });

        newSocket.on('error', (message: string) => {
          alert(message);
        });

        newSocket.on('connect_error', (error) => {
          alert(error.message);
        });
      } catch (error) {
        if (!cancelled) {
          console.error('Unable to connect multiplayer socket:', error);
        }
      }
    };

    void connectSocket();

    return () => {
      cancelled = true;
      newSocket?.close();
    };
  }, [isAuthLoading, userId]);

  useEffect(() => {
    const handleResize = () => {
      const width = Math.min(window.innerWidth - 64, VIEWPORT_WIDTH);
      const height = Math.min(window.innerHeight - 300, VIEWPORT_HEIGHT);
      setViewportSize({ width, height });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (gameStarted || !showBriefing) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setElapsedTime(0);
    }, 0);

    return () => clearTimeout(timeout);
  }, [gameStarted, showBriefing]);

  useEffect(() => {
    if (
      !gameStarted ||
      isEscaped ||
      isGameOver ||
      gameState !== 'PLAYING'
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      const target =
        currentLevel?.hasKey || gameMode === 'QUICK'
          ? hasKey
            ? exitPos
            : keyPos
          : exitPos;

      if (!target) {
        return;
      }

      const tx = target.x * TILE_SIZE + TILE_SIZE / 2;
      const ty = target.y * TILE_SIZE + TILE_SIZE / 2;
      const px = playerRef.current.x;
      const py = playerRef.current.y;

      setActivePulse({
        top: ty < py - TILE_SIZE,
        bottom: ty > py + TILE_SIZE,
        left: tx < px - TILE_SIZE,
        right: tx > px + TILE_SIZE,
        color: hasKey ? '#22c55e' : '#f59e0b',
      });

      window.setTimeout(() => setActivePulse(null), 2000);
    }, 15000);

    return () => clearInterval(interval);
  }, [
    currentLevel?.hasKey,
    exitPos,
    gameMode,
    gameStarted,
    gameState,
    hasKey,
    isEscaped,
    isGameOver,
    keyPos,
  ]);

  useEffect(() => {
    if (gameState === 'PLAYING' && !isMultiplayer) {
      generateNewMaze(currentLevel ?? undefined);
    }
  }, [currentLevel, gameState, generateNewMaze, isMultiplayer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      keysPressed.current.add(event.key.toLowerCase());

      if (
        !gameStarted &&
        gameState === 'PLAYING' &&
        !showBriefing &&
        [
          'w',
          'a',
          's',
          'd',
          'arrowup',
          'arrowdown',
          'arrowleft',
          'arrowright',
        ].includes(event.key.toLowerCase())
      ) {
        setGameStarted(true);
        setStartTime(Date.now());
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keysPressed.current.delete(event.key.toLowerCase());
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (gameState !== 'PLAYING' || isEscaped || isGameOver || showBriefing) {
        return;
      }

      if (controlType === 'JOYSTICK') {
        const touch = event.touches[0];
        const rect = canvasRef.current?.getBoundingClientRect();

        if (!rect) {
          return;
        }

        const base = {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
        const nextJoystick = { active: true, base, stick: base };
        setJoystick(nextJoystick);
        joystickRef.current = nextJoystick;

        if (!gameStarted) {
          setGameStarted(true);
          setStartTime(Date.now());
        }
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (controlType === 'JOYSTICK' && joystickRef.current?.active) {
        event.preventDefault();

        const touch = event.touches[0];
        const rect = canvasRef.current?.getBoundingClientRect();

        if (!rect) {
          return;
        }

        const stick = {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
        const dx = stick.x - joystickRef.current.base.x;
        const dy = stick.y - joystickRef.current.base.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 40;

        if (distance > maxDistance) {
          const angle = Math.atan2(dy, dx);
          stick.x = joystickRef.current.base.x + Math.cos(angle) * maxDistance;
          stick.y = joystickRef.current.base.y + Math.sin(angle) * maxDistance;
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
      canvas.addEventListener('touchstart', handleTouchStart, {
        passive: false,
      });
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
  }, [controlType, gameStarted, gameState, isEscaped, isGameOver, showBriefing]);

  const checkCollision = useCallback(
    (nextX: number, nextY: number, currentMaze: number[][]) => {
      const corners = [
        { x: nextX - PLAYER_COLLISION_RADIUS, y: nextY - PLAYER_COLLISION_RADIUS },
        { x: nextX + PLAYER_COLLISION_RADIUS, y: nextY - PLAYER_COLLISION_RADIUS },
        { x: nextX - PLAYER_COLLISION_RADIUS, y: nextY + PLAYER_COLLISION_RADIUS },
        { x: nextX + PLAYER_COLLISION_RADIUS, y: nextY + PLAYER_COLLISION_RADIUS },
      ];

      for (const corner of corners) {
        if (
          corner.x < 0 ||
          corner.x >= mazeSize.w * TILE_SIZE ||
          corner.y < 0 ||
          corner.y >= mazeSize.h * TILE_SIZE
        ) {
          return true;
        }

        const tileX = Math.floor(corner.x / TILE_SIZE);
        const tileY = Math.floor(corner.y / TILE_SIZE);

        if (currentMaze[tileY] && currentMaze[tileY][tileX] === 1) {
          return true;
        }
      }

      return false;
    },
    [mazeSize.h, mazeSize.w],
  );

  const update = useCallback(() => {
    if (
      gameState !== 'PLAYING' ||
      isEscaped ||
      isGameOver ||
      !mazeRef.current.length ||
      showBriefing ||
      countdown !== null
    ) {
      return;
    }

    const me = isMultiplayer ? multiplayerPlayers[socket?.id || ''] : null;

    if (isMultiplayer && me && (me.escaped || me.eliminated)) {
      return;
    }

    if (!gameStarted && !isMultiplayer) {
      return;
    }

    let dx = 0;
    let dy = 0;

    let keyboardDx = 0;
    let keyboardDy = 0;

    if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) keyboardDy -= 1;
    if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) keyboardDy += 1;
    if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) keyboardDx -= 1;
    if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) keyboardDx += 1;

    if (keyboardDx !== 0 || keyboardDy !== 0) {
      const keyboardDistance = Math.sqrt(
        keyboardDx * keyboardDx + keyboardDy * keyboardDy,
      );
      dx = (keyboardDx / keyboardDistance) * PLAYER_SPEED;
      dy = (keyboardDy / keyboardDistance) * PLAYER_SPEED;
    }

    if (controlType === 'JOYSTICK' && joystickRef.current?.active) {
      const joystickDx =
        joystickRef.current.stick.x - joystickRef.current.base.x;
      const joystickDy =
        joystickRef.current.stick.y - joystickRef.current.base.y;
      const joystickDistance = Math.sqrt(
        joystickDx * joystickDx + joystickDy * joystickDy,
      );

      if (joystickDistance > 0) {
        dx = (joystickDx / joystickDistance) * PLAYER_SPEED;
        dy = (joystickDy / joystickDistance) * PLAYER_SPEED;
      }
    }

    if (controlType === 'DPAD') {
      let dpadDx = 0;
      let dpadDy = 0;

      if (dpadRef.current.up) dpadDy -= 1;
      if (dpadRef.current.down) dpadDy += 1;
      if (dpadRef.current.left) dpadDx -= 1;
      if (dpadRef.current.right) dpadDx += 1;

      if (dpadDx !== 0 || dpadDy !== 0) {
        const dpadDistance = Math.sqrt(dpadDx * dpadDx + dpadDy * dpadDy);
        dx = (dpadDx / dpadDistance) * PLAYER_SPEED;
        dy = (dpadDy / dpadDistance) * PLAYER_SPEED;
      }
    }

    if (dx !== 0 || dy !== 0) {
      const currentPos = playerRef.current;
      let nextX = currentPos.x;
      let nextY = currentPos.y;

      if (!checkCollision(currentPos.x + dx, currentPos.y, mazeRef.current)) {
        nextX += dx;
      }

      if (!checkCollision(currentPos.x, currentPos.y + dy, mazeRef.current)) {
        nextY += dy;
      }

      playerRef.current = { x: nextX, y: nextY };
      setPlayerPos({ x: nextX, y: nextY });

      if (isMultiplayer && socket && lobby) {
        const now = Date.now();

        if (now - lastMoveEmitRef.current > 33) {
          socket.emit('player_move', { lobbyId: lobby.id, x: nextX, y: nextY });
          lastMoveEmitRef.current = now;
        }
      }

      if (!hasKeyRef.current && keyRef.current) {
        const keyX = keyRef.current.x * TILE_SIZE + TILE_SIZE / 2;
        const keyY = keyRef.current.y * TILE_SIZE + TILE_SIZE / 2;
        const distance = Math.sqrt((nextX - keyX) ** 2 + (nextY - keyY) ** 2);

        if (distance < TILE_SIZE / 1.5) {
          hasKeyRef.current = true;
          setHasKey(true);

          if (isMultiplayer && socket && lobby) {
            socket.emit('player_key', { lobbyId: lobby.id });
          }
        }
      }

      const tileX = Math.floor(nextX / TILE_SIZE);
      const tileY = Math.floor(nextY / TILE_SIZE);

      if (hasKeyRef.current && tileX === exitRef.current.x && tileY === exitRef.current.y) {
        if (isMultiplayer && socket && lobby) {
          socket.emit('player_escaped', { lobbyId: lobby.id });
        } else {
          setIsEscaped(true);
          if (gameMode === 'LEVEL' && currentLevel) {
            void saveBestTime(currentLevel.id, (Date.now() - startTime) / 1000);
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
  }, [
    checkCollision,
    controlType,
    countdown,
    currentLevel,
    gameMode,
    gameStarted,
    gameState,
    isEscaped,
    isGameOver,
    isMultiplayer,
    lobby,
    multiplayerPlayers,
    saveBestTime,
    showBriefing,
    socket,
    startTime,
  ]);

  useEffect(() => {
    if (gameState === 'PLAYING' && !isEscaped && !isGameOver) {
      requestRef.current = requestAnimationFrame(update);
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [gameState, isEscaped, isGameOver, update]);

  useEffect(() => {
    if (gameState !== 'PLAYING') {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas || maze.length === 0) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const me = isMultiplayer ? multiplayerPlayers[socket?.id || ''] : null;
    let targetX = playerPos.x;
    let targetY = playerPos.y;

    if (isMultiplayer && me && (me.escaped || me.eliminated)) {
      const targetId =
        spectatingId ||
        Object.keys(multiplayerPlayers).find(
          (id) =>
            !multiplayerPlayers[id].escaped &&
            !multiplayerPlayers[id].eliminated,
        );
      const target = targetId ? multiplayerPlayers[targetId] : me;
      targetX = target.x;
      targetY = target.y;
    }

    const camX = Math.max(
      0,
      Math.min(targetX - viewportSize.width / 2, mazeSize.w * TILE_SIZE - viewportSize.width),
    );
    const camY = Math.max(
      0,
      Math.min(targetY - viewportSize.height / 2, mazeSize.h * TILE_SIZE - viewportSize.height),
    );

    context.fillStyle = '#020617';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.translate(-camX, -camY);

    context.fillStyle = '#1e293b';
    maze.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 1) {
          const wallX = x * TILE_SIZE;
          const wallY = y * TILE_SIZE;
          if (
            wallX + TILE_SIZE > camX &&
            wallX < camX + viewportSize.width &&
            wallY + TILE_SIZE > camY &&
            wallY < camY + viewportSize.height
          ) {
            context.fillRect(wallX, wallY, TILE_SIZE, TILE_SIZE);
          }
        }
      });
    });

    const exitX = exitPos.x * TILE_SIZE + TILE_SIZE / 2;
    const exitY = exitPos.y * TILE_SIZE + TILE_SIZE / 2;
    context.save();
    context.shadowBlur = 20;
    const exitColor = hasKey ? '#22c55e' : '#ef4444';
    context.shadowColor = exitColor;
    context.fillStyle = exitColor;
    context.beginPath();
    context.arc(exitX, exitY, TILE_SIZE / 2.5, 0, Math.PI * 2);
    context.fill();
    context.restore();

    if (!hasKey && keyPos) {
      const keyX = keyPos.x * TILE_SIZE + TILE_SIZE / 2;
      const keyY = keyPos.y * TILE_SIZE + TILE_SIZE / 2;
      const pulse = Math.sin(Date.now() / 200) * 10 + 15;

      context.save();
      context.shadowBlur = pulse;
      context.shadowColor = '#f59e0b';
      context.fillStyle = '#f59e0b';
      context.beginPath();
      context.moveTo(keyX, keyY - 8);
      context.lineTo(keyX + 6, keyY);
      context.lineTo(keyX, keyY + 8);
      context.lineTo(keyX - 6, keyY);
      context.closePath();
      context.fill();
      context.restore();
    }

    if (isMultiplayer) {
      Object.values(multiplayerPlayers).forEach((player) => {
        if (player.id === socket?.id || player.escaped || player.eliminated) {
          return;
        }

        context.save();
        context.fillStyle = player.color;
        context.shadowBlur = 15;
        context.shadowColor = player.color;
        context.beginPath();
        context.arc(player.x, player.y, TILE_SIZE / 2.8, 0, Math.PI * 2);
        context.fill();
        context.restore();
      });
    }

    const isMeActive = !isMultiplayer || (me && !me.escaped && !me.eliminated);
    if (isMeActive) {
      const px = playerPos.x;
      const py = playerPos.y;
      context.save();
      const playerColor = isMultiplayer ? me?.color || '#06b6d4' : '#06b6d4';
      if (hasKey) {
        context.shadowBlur = 35;
        context.shadowColor = '#f59e0b';
        context.strokeStyle = '#f59e0b';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(px, py, TILE_SIZE / 2.8, 0, Math.PI * 2);
        context.stroke();
      } else {
        context.shadowBlur = 25;
        context.shadowColor = playerColor;
      }
      context.fillStyle = playerColor;
      context.beginPath();
      context.arc(px, py, TILE_SIZE / 3, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    context.restore();

    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = canvas.width;
    fogCanvas.height = canvas.height;
    const fogContext = fogCanvas.getContext('2d');

    if (!fogContext) {
      return;
    }

    fogContext.fillStyle = 'rgba(2, 6, 23, 0.98)';
    fogContext.fillRect(0, 0, canvas.width, canvas.height);

    targetX =
      isMultiplayer && spectatingId && multiplayerPlayers[spectatingId]
        ? multiplayerPlayers[spectatingId].x
        : playerPos.x;
    targetY =
      isMultiplayer && spectatingId && multiplayerPlayers[spectatingId]
        ? multiplayerPlayers[spectatingId].y
        : playerPos.y;

    const screenX = targetX - camX;
    const screenY = targetY - camY;

    const gradient = fogContext.createRadialGradient(
      screenX,
      screenY,
      0,
      screenX,
      screenY,
      VISION_RADIUS,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.4)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    fogContext.globalCompositeOperation = 'destination-out';
    fogContext.fillStyle = gradient;
    fogContext.beginPath();
    fogContext.arc(screenX, screenY, VISION_RADIUS, 0, Math.PI * 2);
    fogContext.fill();

    context.drawImage(fogCanvas, 0, 0);
  }, [
    exitPos,
    gameState,
    hasKey,
    isMultiplayer,
    keyPos,
    maze,
    mazeSize.h,
    mazeSize.w,
    multiplayerPlayers,
    playerPos,
    socket,
    spectatingId,
    viewportSize.height,
    viewportSize.width,
  ]);

  const hostLobby = useCallback(() => {
    socket?.emit('host_lobby', { name: user?.displayName || 'Player' });
  }, [socket, user?.displayName]);

  const joinLobby = useCallback(() => {
    socket?.emit('join_lobby', {
      lobbyId: lobbyIdInput,
      name: user?.displayName || 'Player',
    });
  }, [lobbyIdInput, socket, user?.displayName]);

  const leaveLobby = useCallback(() => {
    if (lobby) {
      socket?.emit('leave_lobby', { lobbyId: lobby.id });
    }
    setLobby(null);
    setIsMultiplayer(false);
    setIsEscaped(false);
    setIsGameOver(false);
    setGameState('MULTIPLAYER_MENU');
  }, [lobby, socket]);

  const toggleReady = useCallback(() => {
    if (!lobby) {
      return;
    }

    const me = lobby.players.find((player) => player.id === socket?.id);
    socket?.emit('ready_up', { lobbyId: lobby.id, ready: !me?.ready });
  }, [lobby, socket]);

  const changeColor = useCallback(
    (color: (typeof PLAYER_COLORS)[number]) => {
      if (!lobby) {
        return;
      }

      socket?.emit('change_color', { lobbyId: lobby.id, color });
    },
    [lobby, socket],
  );

  const canUseMultiplayer = Boolean(user && socket);
  const multiplayerPhase: 'MENU' | 'LOBBY' | 'GAME' =
    gameState === 'LOBBY'
      ? 'LOBBY'
      : gameState === 'PLAYING' || gameState === 'INTERMISSION'
        ? 'GAME'
        : 'MENU';

  return useMemo(
    () => ({
      activePulse,
      allOpponentsQuit,
      bestTimes,
      canUseMultiplayer,
      canvasRef,
      changeColor,
      controlType,
      countdown,
      currentLevel,
      dpadInput,
      dpadRef,
      elapsedTime,
      gameMode,
      gameStarted,
      gameState,
      generateNewMaze,
      getStarsForTime,
      hasKey,
      hostLobby,
      intermission,
      isAuthLoading,
      isEarlyLeave,
      isEscaped,
      isGameOver,
      isMultiplayer,
      isNewBest,
      joinLobby,
      joystick,
      joystickRef,
      keyPos,
      leaveLobby,
      lobby,
      lobbyIdInput,
      maze,
      mazeSize,
      multiplayerPhase,
      multiplayerPlayers,
      multiplayerTimeLimit,
      notifications,
      playerPos,
      playerRef,
      restartCurrentRun,
      setControlType,
      setCountdown,
      setCurrentLevel,
      setDpadInput,
      setGameMode,
      setGameStarted,
      setGameState,
      setHasKey,
      setIntermission,
      setIsEarlyLeave,
      setIsEscaped,
      setIsGameOver,
      setIsMultiplayer,
      setJoystick,
      setLobby,
      setLobbyIdInput,
      setMultiplayerPlayers,
      setShowBriefing,
      setSpectatingId,
      setStartTime,
      setUserFacingMenuState: setGameState,
      showBriefing,
      signInWithGoogle,
      socket,
      spectatingId,
      startLevelRun,
      startQuickPlay,
      startTime,
      toggleReady,
      totalStars,
      user,
      viewportSize,
      exitPos,
      isPlayerAuthenticated: Boolean(user),
      logout,
    }),
    [
      activePulse,
      allOpponentsQuit,
      bestTimes,
      canUseMultiplayer,
      changeColor,
      controlType,
      countdown,
      currentLevel,
      dpadInput,
      elapsedTime,
      gameMode,
      gameStarted,
      gameState,
      generateNewMaze,
      getStarsForTime,
      hasKey,
      hostLobby,
      intermission,
      isAuthLoading,
      isEarlyLeave,
      isEscaped,
      isGameOver,
      isMultiplayer,
      isNewBest,
      joinLobby,
      joystick,
      keyPos,
      leaveLobby,
      lobby,
      lobbyIdInput,
      logout,
      maze,
      mazeSize,
      multiplayerPhase,
      multiplayerPlayers,
      multiplayerTimeLimit,
      notifications,
      playerPos,
      restartCurrentRun,
      showBriefing,
      signInWithGoogle,
      socket,
      spectatingId,
      startLevelRun,
      startQuickPlay,
      startTime,
      toggleReady,
      totalStars,
      user,
      viewportSize,
      exitPos,
    ],
  );
}

type MazeyAppContextValue = ReturnType<typeof useMazeyAppState>;

const MazeyAppContext = createContext<MazeyAppContextValue | null>(null);

export function MazeyAppProvider({ children }: PropsWithChildren) {
  const value = useMazeyAppState();

  return (
    <MazeyAppContext.Provider value={value}>{children}</MazeyAppContext.Provider>
  );
}

export function useMazeyApp() {
  const context = useContext(MazeyAppContext);

  if (!context) {
    throw new Error('useMazeyApp must be used within MazeyAppProvider.');
  }

  return context;
}
