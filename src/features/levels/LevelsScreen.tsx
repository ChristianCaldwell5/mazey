import { Lock, Star, Trophy } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LEVELS } from '../gameplay/constants';
import { useMazeyApp } from '../app/MazeyAppContext';

export function LevelsScreen() {
  const navigate = useNavigate();
  const { bestTimes, getStarsForTime, setGameState, totalStars } = useMazeyApp();

  useEffect(() => {
    setGameState('LEVEL_SELECT');
  }, [setGameState]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans">
      <div className="max-w-4xl w-full space-y-12">
        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <button
              onClick={() => navigate('/main-menu')}
              className="text-slate-500 hover:text-white transition-colors text-sm font-medium"
            >
              ← Back to Menu
            </button>
            <h1 className="text-5xl font-black tracking-tighter text-white">
              LEVELS
            </h1>
          </div>
          <div className="text-right flex items-center gap-6">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-widest">
                Stars
              </p>
              <p className="text-2xl font-mono font-bold text-amber-400 flex items-center gap-2">
                <Star className="w-5 h-5 fill-amber-400" />
                {totalStars}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-widest">
                Progression
              </p>
              <p className="text-2xl font-mono font-bold text-cyan-400">
                {Object.keys(bestTimes).length}/{LEVELS.length}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {LEVELS.map((level) => {
            const bestTime = bestTimes[level.id];
            const isLocked = totalStars < level.starsRequired;
            const difficultyColors = {
              emerald:
                'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10',
              amber:
                'border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10',
              rose:
                'border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10',
              void:
                'border-purple-500/30 bg-purple-500/5 text-purple-400 hover:bg-purple-500/10',
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
                  <span className="text-slate-800 font-black absolute top-2 left-3 opacity-40">
                    {level.id}
                  </span>
                </div>
              );
            }

            return (
              <button
                key={level.id}
                onClick={() => navigate(`/levels/${level.id}`)}
                className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group ${difficultyColors[level.difficulty]}`}
              >
                <span className="text-3xl font-black">{level.id}</span>
                {bestTime && (
                  <>
                    <div className="absolute top-2 right-2">
                      <Trophy className="w-3 h-3 text-amber-400" />
                    </div>
                    <div className="absolute top-6 right-2 flex flex-col gap-0.5">
                      {[...Array(3)].map((_, index) => {
                        const stars = getStarsForTime(level.id, bestTime);
                        return (
                          <Star
                            key={index}
                            className={`w-2 h-2 ${index < stars ? 'text-amber-400 fill-amber-400' : 'text-slate-800'}`}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
                <div className="text-[10px] uppercase tracking-widest font-bold opacity-60 flex flex-col items-center">
                  <span>
                    {level.width}x{level.height}
                  </span>
                  {bestTime && (
                    <span className="text-cyan-400 mt-1">
                      {bestTime.toFixed(2)}s
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
