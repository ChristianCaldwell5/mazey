import { motion } from 'motion/react';
import {
  LogIn,
  LogOut,
  RefreshCw,
  Settings,
  Trophy,
  User as UserIcon,
  Zap,
} from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMazeyApp } from '../app/MazeyAppContext';

export function MainMenuScreen() {
  const navigate = useNavigate();
  const {
    isAuthLoading,
    logout,
    setGameState,
    signInWithGoogle,
    startQuickPlay,
    user,
  } = useMazeyApp();

  useEffect(() => {
    setGameState('MENU');
  }, [setGameState]);

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
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
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
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-10 h-10 rounded-full border border-cyan-500/30"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-slate-500" />
                  </div>
                )}
                <div className="text-left">
                  <p className="text-sm font-bold text-white truncate max-w-[120px]">
                    {user.displayName}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                    Authenticated
                  </p>
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
            onClick={() => {
              startQuickPlay();
              navigate('/quick-play');
            }}
            className="group relative px-8 py-4 bg-white text-slate-950 rounded-2xl font-bold text-xl hover:bg-cyan-50 transition-all active:scale-95 flex items-center justify-center gap-3 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <Zap className="w-5 h-5 fill-current" />
            Quick Play
          </button>

          <button
            onClick={() => navigate('/levels')}
            className="group relative px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xl border border-slate-800 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <Trophy className="w-5 h-5 text-amber-400" />
            Levels
          </button>

          <button
            onClick={() => navigate('/multiplayer')}
            className="group relative px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xl border border-slate-800 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <UserIcon className="w-5 h-5 text-cyan-400" />
            Multiplayer
          </button>

          <button
            onClick={() => navigate('/settings')}
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
