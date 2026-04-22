import { Zap } from 'lucide-react';
import { PLAYER_COLORS } from '../../multiplayer/contracts';
import { useMazeyApp } from '../app/MazeyAppContext';

export function LobbyScreen() {
  const { changeColor, leaveLobby, lobby, socket, toggleReady } = useMazeyApp();

  if (!lobby) {
    return null;
  }

  const me = lobby.players.find((player) => player.id === socket?.id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans">
      <div className="max-w-4xl w-full space-y-12">
        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <button
              onClick={leaveLobby}
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
              {lobby.players.map((player) => (
                <div
                  key={player.id}
                  className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-full border-2 border-white/10 shadow-lg"
                      style={{
                        backgroundColor: player.color,
                        boxShadow: `0 0 20px ${player.color}40`,
                      }}
                    />
                    <div className="space-y-0.5">
                      <p className="font-bold text-white flex items-center gap-2">
                        {player.name}
                        {player.id === lobby.hostId && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-md border border-cyan-500/30">
                            HOST
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 font-medium">
                        {player.ready ? 'READY' : 'WAITING...'}
                      </p>
                    </div>
                  </div>
                  {player.ready && (
                    <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                Your Color
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {PLAYER_COLORS.map((color) => {
                  const isTaken = lobby.players.some(
                    (player) => player.color === color && player.id !== socket?.id,
                  );

                  return (
                    <button
                      key={color}
                      disabled={isTaken}
                      onClick={() => changeColor(color)}
                      className={`aspect-square rounded-2xl border-2 transition-all flex items-center justify-center ${
                        me?.color === color
                          ? 'border-white scale-110 shadow-xl'
                          : isTaken
                            ? 'border-transparent opacity-20 cursor-not-allowed'
                            : 'border-white/5 hover:border-white/20'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {me?.color === color && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="pt-8 border-t border-slate-800 space-y-4">
              <button
                onClick={toggleReady}
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
