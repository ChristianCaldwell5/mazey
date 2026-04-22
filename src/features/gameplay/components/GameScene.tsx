import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Key,
  Move,
  RefreshCw,
  Star,
  Timer,
  Trophy,
  Unlock,
  User as UserIcon,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TILE_SIZE } from '../constants';
import { useMazeyApp } from '../../app/MazeyAppContext';

export function GameScene() {
  const navigate = useNavigate();
  const {
    activePulse,
    allOpponentsQuit,
    bestTimes,
    canvasRef,
    controlType,
    countdown,
    currentLevel,
    dpadInput,
    dpadRef,
    elapsedTime,
    exitPos,
    gameMode,
    gameStarted,
    gameState,
    getStarsForTime,
    hasKey,
    intermission,
    isEarlyLeave,
    isEscaped,
    isGameOver,
    isMultiplayer,
    isNewBest,
    joystick,
    keyPos,
    leaveLobby,
    lobby,
    mazeSize,
    multiplayerPlayers,
    multiplayerTimeLimit,
    notifications,
    playerPos,
    restartCurrentRun,
    setDpadInput,
    setGameStarted,
    setGameState,
    setIsEarlyLeave,
    setIsEscaped,
    setIsGameOver,
    setShowBriefing,
    setSpectatingId,
    setStartTime,
    showBriefing,
    socket,
    spectatingId,
    viewportSize,
  } = useMazeyApp();

  const backLabel =
    gameMode === 'LEVEL' ? 'Levels' : gameMode === 'MULTIPLAYER' ? 'Multiplayer' : 'Menu';

  const handleBack = () => {
    if (gameMode === 'LEVEL') {
      navigate('/levels');
      return;
    }

    if (gameMode === 'MULTIPLAYER') {
      leaveLobby();
      navigate('/multiplayer');
      return;
    }

    navigate('/main-menu');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-8 font-sans selection:bg-cyan-500/30 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-4xl w-full flex flex-col items-center gap-8"
      >
        <div className="w-full flex justify-between items-center max-w-[672px]">
          <button
            onClick={handleBack}
            className="text-slate-500 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
          >
            ← {backLabel}
          </button>
          <div className="flex gap-6 items-center select-none">
            {(currentLevel?.hasKey || gameMode === 'QUICK') && (
              <div
                className={`p-2 rounded-xl border transition-all ${
                  hasKey
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                    : 'bg-slate-900/50 border-slate-800 text-slate-700'
                }`}
              >
                <Key className="w-4 h-4" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Timer
                className={`w-4 h-4 ${
                  currentLevel?.timeLimit || multiplayerTimeLimit
                    ? 'text-red-400'
                    : 'text-cyan-400'
                }`}
              />
              <span
                className={`text-xl font-mono font-bold ${
                  (currentLevel?.timeLimit &&
                    currentLevel.timeLimit - elapsedTime < 10) ||
                  (multiplayerTimeLimit && multiplayerTimeLimit - elapsedTime < 10)
                    ? 'text-red-400 animate-pulse'
                    : 'text-white'
                }`}
              >
                {currentLevel?.timeLimit
                  ? `${Math.max(0, currentLevel.timeLimit - elapsedTime).toFixed(1)}s`
                  : multiplayerTimeLimit
                    ? `${Math.max(0, multiplayerTimeLimit - elapsedTime).toFixed(1)}s`
                    : `${elapsedTime.toFixed(2)}s`}
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
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur opacity-20 transition duration-1000" />
          <div className="relative border-4 border-slate-800 rounded-xl overflow-hidden shadow-2xl bg-slate-900 select-none touch-none">
            <canvas
              ref={canvasRef}
              width={viewportSize.width}
              height={viewportSize.height}
              className="block touch-none"
            />

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
                        {gameMode === 'QUICK'
                          ? 'Quick Match'
                          : `Level ${currentLevel?.id}`}
                      </h2>
                      {gameMode === 'LEVEL' &&
                        currentLevel &&
                        bestTimes[currentLevel.id] && (
                          <p className="text-cyan-400 text-sm font-bold">
                            Best: {bestTimes[currentLevel.id].toFixed(2)}s
                          </p>
                        )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                        <div
                          className={`p-2 rounded-lg ${
                            currentLevel?.hasKey || gameMode === 'QUICK'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-green-500/10 text-green-400'
                          }`}
                        >
                          {currentLevel?.hasKey || gameMode === 'QUICK' ? (
                            <Key className="w-5 h-5" />
                          ) : (
                            <Unlock className="w-5 h-5" />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-white font-bold text-sm">
                            {currentLevel?.hasKey || gameMode === 'QUICK'
                              ? 'Key Required'
                              : 'No Key Needed'}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {currentLevel?.hasKey || gameMode === 'QUICK'
                              ? 'Find the key before exit'
                              : 'Head straight to the exit'}
                          </p>
                        </div>
                      </div>

                      {currentLevel?.timeLimit && (
                        <div className="flex items-center gap-4 p-4 bg-red-500/5 rounded-2xl border border-red-500/10">
                          <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
                            <Timer className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <p className="text-red-400 font-bold text-sm">
                              Timed Escape
                            </p>
                            <p className="text-red-400/60 text-xs">
                              {currentLevel.timeLimit}s limit
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setShowBriefing(false)}
                      className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black hover:bg-cyan-50 transition-all active:scale-95 shadow-lg shadow-white/5"
                    >
                      OK
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {isMultiplayer && lobby?.gameMode === 'BATTLE_ROYALE' && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 z-40 flex items-center gap-3">
                <UserIcon className="w-5 h-5 text-cyan-400" />
                <span className="text-sm font-bold text-white">
                  {
                    Object.values(multiplayerPlayers).filter(
                      (player) => !player.eliminated && !player.escaped,
                    ).length
                  }{' '}
                  Left
                </span>
              </div>
            )}

            {isMultiplayer &&
              multiplayerPlayers[socket?.id || ''] &&
              (multiplayerPlayers[socket?.id || ''].escaped ||
                multiplayerPlayers[socket?.id || ''].eliminated) && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 z-40">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Spectating
                  </span>
                  <div className="flex items-center gap-2">
                    {Object.values(multiplayerPlayers)
                      .filter((player) => !player.escaped && !player.eliminated)
                      .map((player) => (
                        <button
                          key={player.id}
                          onClick={() => setSpectatingId(player.id)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            spectatingId === player.id
                              ? 'border-white scale-110'
                              : 'border-transparent opacity-50 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: player.color }}
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
                      style={{
                        backgroundColor: activePulse.color,
                        boxShadow: `0 4px 15px ${activePulse.color}`,
                      }}
                    />
                  )}
                  {activePulse.bottom && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2 }}
                      className="absolute bottom-0 left-0 right-0 h-1.5 z-20"
                      style={{
                        backgroundColor: activePulse.color,
                        boxShadow: `0 -4px 15px ${activePulse.color}`,
                      }}
                    />
                  )}
                  {activePulse.left && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2 }}
                      className="absolute top-0 bottom-0 left-0 w-1.5 z-20"
                      style={{
                        backgroundColor: activePulse.color,
                        boxShadow: `4px 0 15px ${activePulse.color}`,
                      }}
                    />
                  )}
                  {activePulse.right && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 2 }}
                      className="absolute top-0 bottom-0 right-0 w-1.5 z-20"
                      style={{
                        backgroundColor: activePulse.color,
                        boxShadow: `-4px 0 15px ${activePulse.color}`,
                      }}
                    />
                  )}
                </>
              )}
            </AnimatePresence>

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
                    left: 24 + (joystick.stick.x - joystick.base.x),
                    top: 24 + (joystick.stick.y - joystick.base.y),
                  }}
                />
              </div>
            )}

            {controlType === 'DPAD' && (
              <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-auto select-none">
                <div className="flex justify-center">
                  <button
                    onPointerDown={() => {
                      dpadRef.current.up = true;
                      setDpadInput((prev) => ({ ...prev, up: true }));
                      if (!gameStarted) {
                        setGameStarted(true);
                        setStartTime(Date.now());
                      }
                    }}
                    onPointerUp={() => {
                      dpadRef.current.up = false;
                      setDpadInput((prev) => ({ ...prev, up: false }));
                    }}
                    onPointerLeave={() => {
                      dpadRef.current.up = false;
                      setDpadInput((prev) => ({ ...prev, up: false }));
                    }}
                    className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all backdrop-blur-md ${
                      dpadInput.up
                        ? 'bg-cyan-500/40 border-cyan-400 scale-90 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
                        : 'bg-slate-950/20 border-slate-700/30'
                    }`}
                  >
                    <ChevronUp
                      className={`w-12 h-12 ${
                        dpadInput.up ? 'text-white' : 'text-slate-400/40'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onPointerDown={() => {
                      dpadRef.current.left = true;
                      setDpadInput((prev) => ({ ...prev, left: true }));
                      if (!gameStarted) {
                        setGameStarted(true);
                        setStartTime(Date.now());
                      }
                    }}
                    onPointerUp={() => {
                      dpadRef.current.left = false;
                      setDpadInput((prev) => ({ ...prev, left: false }));
                    }}
                    onPointerLeave={() => {
                      dpadRef.current.left = false;
                      setDpadInput((prev) => ({ ...prev, left: false }));
                    }}
                    className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all backdrop-blur-md ${
                      dpadInput.left
                        ? 'bg-cyan-500/40 border-cyan-400 scale-90 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
                        : 'bg-slate-950/20 border-slate-700/30'
                    }`}
                  >
                    <ChevronLeft
                      className={`w-12 h-12 ${
                        dpadInput.left ? 'text-white' : 'text-slate-400/40'
                      }`}
                    />
                  </button>
                  <div className="w-20 h-20 rounded-2xl bg-slate-950/5 border-2 border-slate-800/20 flex items-center justify-center backdrop-blur-[2px]">
                    <div className="w-3 h-3 rounded-full bg-slate-700/20" />
                  </div>
                  <button
                    onPointerDown={() => {
                      dpadRef.current.right = true;
                      setDpadInput((prev) => ({ ...prev, right: true }));
                      if (!gameStarted) {
                        setGameStarted(true);
                        setStartTime(Date.now());
                      }
                    }}
                    onPointerUp={() => {
                      dpadRef.current.right = false;
                      setDpadInput((prev) => ({ ...prev, right: false }));
                    }}
                    onPointerLeave={() => {
                      dpadRef.current.right = false;
                      setDpadInput((prev) => ({ ...prev, right: false }));
                    }}
                    className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all backdrop-blur-md ${
                      dpadInput.right
                        ? 'bg-cyan-500/40 border-cyan-400 scale-90 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
                        : 'bg-slate-900/20 border-slate-700/30'
                    }`}
                  >
                    <ChevronRight
                      className={`w-12 h-12 ${
                        dpadInput.right ? 'text-white' : 'text-slate-400/40'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    onPointerDown={() => {
                      dpadRef.current.down = true;
                      setDpadInput((prev) => ({ ...prev, down: true }));
                      if (!gameStarted) {
                        setGameStarted(true);
                        setStartTime(Date.now());
                      }
                    }}
                    onPointerUp={() => {
                      dpadRef.current.down = false;
                      setDpadInput((prev) => ({ ...prev, down: false }));
                    }}
                    onPointerLeave={() => {
                      dpadRef.current.down = false;
                      setDpadInput((prev) => ({ ...prev, down: false }));
                    }}
                    className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all backdrop-blur-md ${
                      dpadInput.down
                        ? 'bg-cyan-500/40 border-cyan-400 scale-90 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
                        : 'bg-slate-950/20 border-slate-700/30'
                    }`}
                  >
                    <ChevronDown
                      className={`w-12 h-12 ${
                        dpadInput.down ? 'text-white' : 'text-slate-400/40'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

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
                  STARTING IN{' '}
                  <span className="text-cyan-400 text-4xl ml-2">
                    {countdown}
                  </span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col items-center gap-2">
            <AnimatePresence>
              {notifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 px-5 py-2 rounded-2xl text-sm font-bold text-slate-400 flex items-center gap-3 shadow-xl"
                >
                  <UserIcon className="w-4 h-4 text-rose-500" />
                  <span>{notification.message}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-4 h-4" />
      </motion.div>

      <AnimatePresence>
        {((!isMultiplayer && (isEscaped || isGameOver)) ||
          (isMultiplayer && (isGameOver || gameState === 'INTERMISSION'))) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.9, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className={`max-w-md w-full bg-slate-900 border rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden ${
                !isMultiplayer && isGameOver
                  ? 'border-red-900/30'
                  : 'border-slate-800'
              }`}
            >
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 blur-[100px]" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/10 blur-[100px]" />

              {gameState === 'INTERMISSION' && isMultiplayer && lobby ? (
                <>
                  {(() => {
                    const me = lobby.players.find((player) => player.id === socket?.id);

                    if (lobby.gameMode === 'BEST_OF_3') {
                      const opponent = lobby.players.find(
                        (player) => player.id !== socket?.id,
                      );
                      const iWonRound = lobby.lastRoundWinnerId === me?.id;
                      const myWins = lobby.wins[me?.id || ''] || 0;
                      const opponentWins = lobby.wins[opponent?.id || ''] || 0;

                      return (
                        <>
                          <div className="flex justify-center relative">
                            <div
                              className={`w-24 h-24 rounded-full flex items-center justify-center border ${
                                iWonRound
                                  ? 'bg-green-500/20 border-green-500/30'
                                  : 'bg-red-500/20 border-red-500/30'
                              }`}
                            >
                              {iWonRound ? (
                                <Trophy className="w-12 h-12 text-green-400" />
                              ) : (
                                <Zap className="w-12 h-12 text-red-400" />
                              )}
                            </div>
                          </div>

                          <div className="space-y-2 text-center relative">
                            <h2
                              className={`text-5xl font-black tracking-tight ${
                                iWonRound ? 'text-green-400' : 'text-red-400'
                              }`}
                            >
                              {iWonRound ? 'ROUND WON' : 'ROUND LOSS'}
                            </h2>
                            <div className="flex items-center justify-center gap-4 mt-4 text-3xl font-black">
                              <span className="text-green-400">{myWins}</span>
                              <span className="text-slate-500">-</span>
                              <span className="text-red-400">{opponentWins}</span>
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
                    }

                    const eliminatedIds = lobby.lastRoundEliminatedIds || [];
                    const iAmEliminated = eliminatedIds.includes(me?.id || '');
                    const eliminatedNames = eliminatedIds
                      .map((id) => lobby.players.find((player) => player.id === id)?.name)
                      .join(', ');
                    const remainingPlayers = lobby.players.filter(
                      (player) => !player.eliminated,
                    );

                    return (
                      <>
                        <div className="flex justify-center relative">
                          <div
                            className={`w-24 h-24 rounded-full flex items-center justify-center border ${
                              !iAmEliminated
                                ? 'bg-green-500/20 border-green-500/30'
                                : 'bg-red-500/20 border-red-500/30'
                            }`}
                          >
                            {!iAmEliminated ? (
                              <Trophy className="w-12 h-12 text-green-400" />
                            ) : (
                              <Zap className="w-12 h-12 text-red-400" />
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 text-center relative">
                          <h2
                            className={`text-5xl font-black tracking-tight ${
                              !iAmEliminated ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {!iAmEliminated ? 'YOU SURVIVED' : 'ELIMINATED'}
                          </h2>
                          <p className="text-slate-400 font-medium">
                            {!iAmEliminated
                              ? `${eliminatedNames} was eliminated`
                              : 'Opponents found the exit first'}
                          </p>

                          <div className="mt-6 bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">
                              Remaining Players
                            </h3>
                            <div className="flex flex-wrap justify-center gap-2">
                              {remainingPlayers.map((player) => (
                                <div
                                  key={player.id}
                                  className="px-3 py-1 rounded-lg bg-slate-800 text-white text-sm font-medium flex items-center gap-2"
                                >
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: player.color }}
                                  />
                                  {player.name}
                                </div>
                              ))}
                            </div>
                          </div>

                          <p className="text-slate-400 font-medium mt-6">
                            {iAmEliminated
                              ? 'Spectating in'
                              : 'Next round starting soon'}
                          </p>
                          <p className="text-4xl font-mono font-bold text-white mt-2">
                            {intermission.countdown}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : isMultiplayer && lobby ? (
                <>
                  {(() => {
                    const me = lobby.players.find((player) => player.id === socket?.id);
                    const isWinner =
                      lobby.gameMode === 'BATTLE_ROYALE'
                        ? !me?.eliminated &&
                          lobby.players.filter((player) => !player.eliminated).length === 1
                        : lobby.wins[me?.id || ''] === 2;
                    const isEliminated = me?.eliminated;

                    return (
                      <>
                        <div className="flex justify-center relative">
                          <div
                            className={`w-24 h-24 rounded-full flex items-center justify-center border ${
                              isWinner
                                ? 'bg-green-500/20 border-green-500/30'
                                : 'bg-red-500/20 border-red-500/30'
                            }`}
                          >
                            {isWinner ? (
                              <Trophy className="w-12 h-12 text-green-400" />
                            ) : (
                              <Zap className="w-12 h-12 text-red-400" />
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 text-center relative">
                          <h2
                            className={`text-5xl font-black tracking-tight ${
                              isWinner ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {isWinner ? 'VICTORY!' : isEliminated ? 'ELIMINATED' : 'DEFEAT'}
                          </h2>
                          <p className="text-slate-400 font-medium">
                            {allOpponentsQuit
                              ? 'All opponents quit'
                              : isWinner
                                ? 'You are the champion!'
                                : isEliminated
                                  ? 'Better luck next time.'
                                  : 'You lost the match.'}
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
                                leaveLobby();
                                setIsEscaped(false);
                                setIsEarlyLeave(false);
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
                                  leaveLobby();
                                  setIsEscaped(false);
                                  setIsGameOver(false);
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
                    <h2 className="text-5xl font-black text-white tracking-tight">
                      VICTORY!
                    </h2>
                    <p className="text-slate-400 font-medium">
                      You escaped the neon maze in
                    </p>
                    <p className="text-4xl font-mono font-bold text-green-400">
                      {elapsedTime.toFixed(3)}s
                    </p>

                    {gameMode === 'LEVEL' && currentLevel && (
                      <div className="mt-8 space-y-6">
                        <div className="flex justify-center gap-3">
                          {[...Array(3)].map((_, index) => {
                            const stars = getStarsForTime(currentLevel.id, elapsedTime);
                            return (
                              <motion.div
                                key={index}
                                initial={{ scale: 0, rotate: -45 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{
                                  delay: 0.5 + index * 0.1,
                                  type: 'spring',
                                }}
                              >
                                <Star
                                  className={`w-12 h-12 ${
                                    index < stars
                                      ? 'text-amber-400 fill-amber-400'
                                      : 'text-slate-800'
                                  }`}
                                />
                              </motion.div>
                            );
                          })}
                        </div>

                        <div className="flex flex-col items-center gap-4">
                          {getStarsForTime(currentLevel.id, elapsedTime) < 3 && (
                            <div className="text-sm font-bold text-slate-500 flex items-center gap-2 bg-slate-950/50 px-4 py-2 rounded-full border border-slate-800">
                              <Star className="w-3 h-3 fill-slate-600" />
                              Next Star:{' '}
                              {currentLevel.starTimes[
                                2 - getStarsForTime(currentLevel.id, elapsedTime)
                              ].toFixed(1)}
                              s
                            </div>
                          )}

                          {isNewBest && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 1.2, type: 'spring' }}
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
                      onClick={restartCurrentRun}
                      className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-white text-slate-950 rounded-2xl font-bold text-lg hover:bg-cyan-50 transition-all active:scale-95 shadow-lg"
                    >
                      <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                      Play Again
                    </button>
                    {gameMode === 'LEVEL' && (
                      <button
                        onClick={() => navigate('/levels')}
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
                    <h2 className="text-5xl font-black text-white tracking-tight">
                      SYSTEM FAILURE
                    </h2>
                    <p className="text-red-400 font-medium">
                      The neon power has depleted.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={restartCurrentRun}
                      className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-white text-slate-950 rounded-2xl font-bold text-lg hover:bg-red-50 transition-all active:scale-95 shadow-lg"
                    >
                      <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                      Retry Level
                    </button>
                    <button
                      onClick={() => navigate('/levels')}
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
  );
}
