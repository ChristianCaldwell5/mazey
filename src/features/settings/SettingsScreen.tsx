import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMazeyApp } from '../app/MazeyAppContext';

export function SettingsScreen() {
  const navigate = useNavigate();
  const { controlType, setControlType, setGameState } = useMazeyApp();

  useEffect(() => {
    setGameState('SETTINGS');
  }, [setGameState]);

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
            SETTINGS
          </h1>
        </div>

        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
              Mobile Controls
            </h2>
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

          <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
              Mobile Overlay Preview
            </h2>
            <div className="flex flex-col items-center gap-2 opacity-70">
              <button className="w-16 h-16 rounded-2xl border border-slate-700/50 flex items-center justify-center">
                <ChevronUp className="w-8 h-8 text-slate-400" />
              </button>
              <div className="flex gap-2">
                <button className="w-16 h-16 rounded-2xl border border-slate-700/50 flex items-center justify-center">
                  <ChevronLeft className="w-8 h-8 text-slate-400" />
                </button>
                <button className="w-16 h-16 rounded-2xl border border-slate-700/30 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                </button>
                <button className="w-16 h-16 rounded-2xl border border-slate-700/50 flex items-center justify-center">
                  <ChevronRight className="w-8 h-8 text-slate-400" />
                </button>
              </div>
              <button className="w-16 h-16 rounded-2xl border border-slate-700/50 flex items-center justify-center">
                <ChevronDown className="w-8 h-8 text-slate-400" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
