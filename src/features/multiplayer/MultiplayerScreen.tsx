import { Key, RefreshCw, User as UserIcon, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMazeyApp } from '../app/MazeyAppContext';
import { GameScene } from '../gameplay/components/GameScene';
import { LobbyScreen } from './LobbyScreen';

export function MultiplayerScreen() {
  const navigate = useNavigate();
  const {
    canUseMultiplayer,
    gameState,
    hostLobby,
    isMultiplayer,
    joinLobby,
    lobby,
    lobbyIdInput,
    multiplayerPhase,
    setGameState,
    setLobbyIdInput,
    user,
  } = useMazeyApp();

  useEffect(() => {
    if (!['LOBBY', 'PLAYING', 'INTERMISSION'].includes(gameState)) {
      setGameState('MULTIPLAYER_MENU');
    }
  }, [gameState, setGameState]);

  if (multiplayerPhase === 'LOBBY' && lobby) {
    return <LobbyScreen />;
  }

  if (multiplayerPhase === 'GAME' && isMultiplayer) {
    return <GameScene />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans">
      <div className="max-w-2xl w-full space-y-12">
        <div className="space-y-2">
          <button
            onClick={() => navigate('/main-menu')}
            className="text-slate-500 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
          >
            ← Back to Menu
          </button>
          <h1 className="text-5xl font-black tracking-tighter text-white">
            MULTIPLAYER
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-[2rem] space-y-6">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-2xl flex items-center justify-center border border-cyan-500/30">
              <Zap className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Host Game</h2>
              <p className="text-slate-400 text-sm">
                Create a private lobby and invite your friends to compete.
              </p>
            </div>
            <button
              onClick={hostLobby}
              disabled={!canUseMultiplayer}
              className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-black hover:bg-cyan-400 transition-all active:scale-95 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <p className="text-slate-400 text-sm">
                Enter a session key to join an existing private lobby.
              </p>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Enter Session Key"
                value={lobbyIdInput}
                onChange={(event) =>
                  setLobbyIdInput(event.target.value.toUpperCase())
                }
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:border-cyan-500 outline-none transition-colors"
              />
              <button
                onClick={joinLobby}
                disabled={!canUseMultiplayer}
                className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join Lobby
              </button>
            </div>
          </div>

          {!user && (
            <div className="md:col-span-2 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-sm text-amber-200">
              Sign in with Google to use the NestJS multiplayer service.
            </div>
          )}

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
