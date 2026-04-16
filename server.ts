import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Maze Generation Logic for Server
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

function generateMaze(width: number, height: number, seed: number) {
  const maze = Array(height).fill(0).map(() => Array(width).fill(1));
  const rng = new SeededRandom(seed);

  function carve(x: number, y: number) {
    maze[y][x] = 0;
    const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && maze[ny][nx] === 1) {
        maze[y + dy / 2][x + dx / 2] = 0;
        carve(nx, ny);
      }
    }
  }

  carve(1, 1);
  return maze;
}

function findValidPos(maze: number[][], rng: SeededRandom): { x: number, y: number } {
  const height = maze.length;
  const width = maze[0].length;
  let x, y;
  let attempts = 0;
  do {
    x = Math.floor(rng.next() * (width - 2)) + 1;
    y = Math.floor(rng.next() * (height - 2)) + 1;
    attempts++;
    // If we can't find a spot in 100 tries, just pick (1, 1) as fallback (though unlikely)
    if (attempts > 100) return { x: 1, y: 1 };
  } while (maze[y][x] !== 0 || (x === 1 && y === 1));
  return { x, y };
}

interface Player {
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
  players: Player[];
  gameState: 'LOBBY' | 'STARTING' | 'PLAYING' | 'FINISHED';
  gameMode?: 'BEST_OF_3' | 'BATTLE_ROYALE';
  maze: number[][] | null;
  exitPos: { x: number; y: number } | null;
  keyPos: { x: number; y: number } | null;
  startTime: number | null;
  timeLimit?: number | null;
  round: number;
  wins: Record<string, number>;
  eliminationOrder: string[];
  timerInterval?: NodeJS.Timeout;
  lastRoundWinnerId?: string;
  lastRoundEliminatedIds?: string[];
}

const lobbies = new Map<string, Lobby>();
const PLAYER_COLORS = ['#22d3ee', '#fbbf24', '#f43f5e', '#10b981', '#a855f7', '#f97316'];

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("host_lobby", (data: { name: string }) => {
      const lobbyId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const lobby: Lobby = {
        id: lobbyId,
        hostId: socket.id,
        players: [{
          id: socket.id,
          name: data.name,
          color: PLAYER_COLORS[0],
          ready: false,
          x: 32,
          y: 32,
          hasKey: false,
          escaped: false,
          eliminated: false
        }],
        gameState: 'LOBBY',
        maze: null,
        exitPos: null,
        keyPos: null,
        startTime: null,
        round: 1,
        wins: {},
        eliminationOrder: []
      };
      lobbies.set(lobbyId, lobby);
      socket.join(lobbyId);
      socket.emit("lobby_joined", lobby);
    });

    socket.on("join_lobby", (data: { lobbyId: string, name: string }) => {
      const lobby = lobbies.get(data.lobbyId.toUpperCase());
      if (!lobby) {
        socket.emit("error", "Lobby not found");
        return;
      }
      if (lobby.gameState !== 'LOBBY') {
        socket.emit("error", "Game already in progress");
        return;
      }

      const usedColors = lobby.players.map(p => p.color);
      const availableColor = PLAYER_COLORS.find(c => !usedColors.includes(c)) || PLAYER_COLORS[0];

      const newPlayer: Player = {
        id: socket.id,
        name: data.name,
        color: availableColor,
        ready: false,
        x: 32,
        y: 32,
        hasKey: false,
        escaped: false,
        eliminated: false
      };

      lobby.players.push(newPlayer);
      socket.join(lobby.id);
      io.to(lobby.id).emit("lobby_updated", lobby);
      socket.emit("lobby_joined", lobby);
    });

    socket.on("ready_up", (data: { lobbyId: string, ready: boolean }) => {
      const lobby = lobbies.get(data.lobbyId);
      if (!lobby) return;

      const player = lobby.players.find(p => p.id === socket.id);
      if (player) {
        player.ready = data.ready;
        io.to(lobby.id).emit("lobby_updated", lobby);

        if (lobby.players.length >= 2 && lobby.players.every(p => p.ready)) {
          startGame(lobby);
        }
      }
    });

    socket.on("change_color", (data: { lobbyId: string, color: string }) => {
      const lobby = lobbies.get(data.lobbyId);
      if (!lobby) return;

      const player = lobby.players.find(p => p.id === socket.id);
      if (player && !lobby.players.some(p => p.color === data.color)) {
        player.color = data.color;
        io.to(lobby.id).emit("lobby_updated", lobby);
      }
    });

    socket.on("player_move", (data: { lobbyId: string, x: number, y: number }) => {
      const lobby = lobbies.get(data.lobbyId);
      if (!lobby) return;

      const player = lobby.players.find(p => p.id === socket.id);
      if (player && !player.escaped && !player.eliminated) {
        player.x = data.x;
        player.y = data.y;
        socket.to(lobby.id).volatile.emit("player_moved", { id: socket.id, x: data.x, y: data.y });
      }
    });

    socket.on("player_key", (data: { lobbyId: string }) => {
      const lobby = lobbies.get(data.lobbyId);
      if (!lobby) return;

      const player = lobby.players.find(p => p.id === socket.id);
      if (player) {
        player.hasKey = true;
        io.to(lobby.id).emit("player_updated", player);
      }
    });

    socket.on("player_escaped", (data: { lobbyId: string }) => {
      const lobby = lobbies.get(data.lobbyId);
      if (!lobby) return;

      const player = lobby.players.find(p => p.id === socket.id);
      if (player && !player.escaped) {
        player.escaped = true;
        const escapeCount = lobby.players.filter(p => p.escaped).length;
        player.placement = escapeCount;
        
        io.to(lobby.id).emit("player_updated", player);

        const activePlayers = lobby.players.filter(p => !p.eliminated);
        const escapedPlayers = activePlayers.filter(p => p.escaped);

        if (lobby.gameMode === 'BATTLE_ROYALE') {
          if (escapedPlayers.length === activePlayers.length - 1) {
            // Battle Royale: Last player eliminated
            const lastPlayer = activePlayers.find(p => !p.escaped);
            if (lastPlayer) {
              lastPlayer.eliminated = true;
              lastPlayer.placement = activePlayers.length;
              lobby.eliminationOrder.push(lastPlayer.id);
              lobby.lastRoundEliminatedIds = [lastPlayer.id];
              io.to(lobby.id).emit("player_eliminated", lastPlayer.id);
              io.to(lobby.id).emit("player_updated", lastPlayer);
            }
            checkGameEnd(lobby);
          } else if (escapedPlayers.length === activePlayers.length) {
            checkGameEnd(lobby);
          }
        } else {
          // Best of 3
          if (escapedPlayers.length === 1) {
            // Round winner
            lobby.wins[player.id] = (lobby.wins[player.id] || 0) + 1;
            lobby.lastRoundWinnerId = player.id;
            if (lobby.wins[player.id] === 2) {
              finishGame(lobby);
            } else {
              startIntermission(lobby);
            }
          }
        }
      }
    });

    socket.on("leave_lobby", (data: { lobbyId: string }) => {
      handleDisconnect(socket);
    });

    socket.on("disconnect", () => {
      handleDisconnect(socket);
    });

    function handleDisconnect(socket: any) {
      for (const [id, lobby] of lobbies.entries()) {
        const playerIndex = lobby.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const playerName = lobby.players[playerIndex].name;
          lobby.players.splice(playerIndex, 1);
          
          // Notify others BEFORE leaving the room
          io.to(id).emit("player_abandoned", { name: playerName, id: socket.id });
          
          socket.leave(id);
          
          if (lobby.players.length === 0) {
            lobbies.delete(id);
          } else {
            if (lobby.hostId === socket.id) {
              lobby.hostId = lobby.players[0].id;
            }
            io.to(id).emit("lobby_updated", lobby);
            if (lobby.gameState === 'PLAYING' || lobby.gameState === 'STARTING') {
              const activePlayers = lobby.players.filter(p => !p.eliminated && !p.escaped);
              if (activePlayers.length === 1 && lobby.players.length === 1) {
                // Last player standing because others quit
                io.to(id).emit("all_opponents_quit");
                checkGameEnd(lobby);
              } else if (activePlayers.length === 0) {
                checkGameEnd(lobby);
              }
            }
          }
          break;
        }
      }
    }
  });

  function startGame(lobby: Lobby) {
    if (lobby.round === 1) {
      lobby.gameMode = lobby.players.length > 2 ? 'BATTLE_ROYALE' : 'BEST_OF_3';
    }

    lobby.gameState = 'STARTING';
    io.to(lobby.id).emit("game_starting", { countdown: 3 });

    setTimeout(() => {
      const seed = Math.floor(Math.random() * 1000000);
      const rng = new SeededRandom(seed);
      const width = 25 + (lobby.round * 2);
      const height = 25 + (lobby.round * 2);
      lobby.maze = generateMaze(width, height, seed);
      lobby.exitPos = { x: width - 2, y: height - 2 };
      lobby.keyPos = findValidPos(lobby.maze, rng);
      lobby.gameState = 'PLAYING';
      lobby.startTime = Date.now();
      lobby.timeLimit = lobby.gameMode === 'BATTLE_ROYALE' ? 60 : null;
      
      lobby.players.forEach(p => {
        p.x = 48;
        p.y = 48;
        p.hasKey = false;
        p.escaped = false;
        p.placement = undefined;
      });

      io.to(lobby.id).emit("game_started", {
        maze: lobby.maze,
        exitPos: lobby.exitPos,
        keyPos: lobby.keyPos,
        players: lobby.players,
        round: lobby.round,
        timeLimit: lobby.timeLimit
      });

      if (lobby.timeLimit) {
        if (lobby.timerInterval) clearInterval(lobby.timerInterval);
        lobby.timerInterval = setInterval(() => {
          const elapsed = (Date.now() - (lobby.startTime || 0)) / 1000;
          if (elapsed >= lobby.timeLimit!) {
            clearInterval(lobby.timerInterval);
            // Time's up! Eliminate everyone who hasn't escaped
            const activePlayers = lobby.players.filter(p => !p.eliminated);
            let eliminatedCount = 0;
            const newlyEliminated: string[] = [];
            activePlayers.forEach(p => {
              if (!p.escaped) {
                p.eliminated = true;
                p.placement = activePlayers.length;
                lobby.eliminationOrder.push(p.id);
                newlyEliminated.push(p.id);
                io.to(lobby.id).emit("player_eliminated", p.id);
                io.to(lobby.id).emit("player_updated", p);
                eliminatedCount++;
              }
            });
            if (eliminatedCount > 0) {
              lobby.lastRoundEliminatedIds = newlyEliminated;
              checkGameEnd(lobby);
            }
          }
        }, 1000);
      }
    }, 4000); // Wait 4 seconds to ensure countdown finishes on all clients
  }

  function checkGameEnd(lobby: Lobby) {
    if (lobby.timerInterval) clearInterval(lobby.timerInterval);
    const activePlayers = lobby.players.filter(p => !p.eliminated);
    if (activePlayers.length <= 1) {
      if (activePlayers.length === 1 && lobby.gameMode === 'BATTLE_ROYALE') {
        activePlayers[0].placement = 1;
        io.to(lobby.id).emit("player_updated", activePlayers[0]);
      }
      finishGame(lobby);
    } else {
      // Next round for Battle Royale
      startIntermission(lobby);
    }
  }

  function startIntermission(lobby: Lobby) {
    if (lobby.timerInterval) clearInterval(lobby.timerInterval);
    lobby.gameState = 'STARTING'; // Use STARTING or add INTERMISSION? Let's keep it simple, we'll emit round_intermission
    io.to(lobby.id).emit("round_intermission", lobby);
    
    setTimeout(() => {
      if (lobbies.has(lobby.id)) {
        lobby.round++;
        startGame(lobby);
      }
    }, 5000);
  }

  function finishGame(lobby: Lobby) {
    if (lobby.timerInterval) clearInterval(lobby.timerInterval);
    lobby.gameState = 'FINISHED';
    io.to(lobby.id).emit("game_finished", lobby);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
