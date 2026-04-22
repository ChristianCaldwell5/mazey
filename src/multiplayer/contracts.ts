export interface MultiplayerPoint {
  x: number;
  y: number;
}

export type MultiplayerGameState =
  | 'LOBBY'
  | 'STARTING'
  | 'PLAYING'
  | 'FINISHED';
export type MultiplayerGameMode = 'BEST_OF_3' | 'BATTLE_ROYALE';

export interface MultiplayerPlayer {
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

export interface Lobby {
  id: string;
  hostId: string;
  players: MultiplayerPlayer[];
  gameState: MultiplayerGameState;
  gameMode?: MultiplayerGameMode;
  maze: number[][] | null;
  exitPos: MultiplayerPoint | null;
  keyPos: MultiplayerPoint | null;
  startTime: number | null;
  timeLimit?: number | null;
  round: number;
  wins: Record<string, number>;
  eliminationOrder: string[];
  lastRoundWinnerId?: string;
  lastRoundEliminatedIds?: string[];
}

export const PLAYER_COLORS = [
  '#22d3ee',
  '#fbbf24',
  '#f43f5e',
  '#10b981',
  '#a855f7',
  '#f97316',
] as const;

export interface HostLobbyPayload {
  name: string;
}

export interface JoinLobbyPayload {
  lobbyId: string;
  name: string;
}

export interface ReadyUpPayload {
  lobbyId: string;
  ready: boolean;
}

export interface ChangeColorPayload {
  lobbyId: string;
  color: string;
}

export interface PlayerMovePayload {
  lobbyId: string;
  x: number;
  y: number;
}

export interface PlayerActionPayload {
  lobbyId: string;
}

export interface CountdownPayload {
  countdown: number;
}

export interface GameStartedPayload {
  maze: number[][];
  exitPos: MultiplayerPoint;
  keyPos: MultiplayerPoint;
  players: MultiplayerPlayer[];
  round: number;
  timeLimit: number | null;
}

export interface PlayerNotificationPayload {
  name: string;
  id: string;
}

export interface PlayerMovedPayload {
  id: string;
  x: number;
  y: number;
}

export interface ClientToServerEvents {
  host_lobby: (data: HostLobbyPayload) => void;
  join_lobby: (data: JoinLobbyPayload) => void;
  ready_up: (data: ReadyUpPayload) => void;
  change_color: (data: ChangeColorPayload) => void;
  player_move: (data: PlayerMovePayload) => void;
  player_key: (data: PlayerActionPayload) => void;
  player_escaped: (data: PlayerActionPayload) => void;
  leave_lobby: (data: PlayerActionPayload) => void;
}

export interface ServerToClientEvents {
  lobby_joined: (data: Lobby) => void;
  lobby_updated: (data: Lobby) => void;
  game_starting: (data: CountdownPayload) => void;
  game_started: (data: GameStartedPayload) => void;
  player_abandoned: (data: PlayerNotificationPayload) => void;
  player_escaped_notification: (data: PlayerNotificationPayload) => void;
  round_intermission: (data: Lobby) => void;
  all_opponents_quit: () => void;
  player_moved: (data: PlayerMovedPayload) => void;
  player_updated: (data: MultiplayerPlayer) => void;
  player_eliminated: (playerId: string) => void;
  game_finished: (data: Lobby) => void;
  error: (message: string) => void;
}
