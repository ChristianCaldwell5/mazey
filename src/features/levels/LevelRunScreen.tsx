import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useMazeyApp } from '../app/MazeyAppContext';
import { LEVELS } from '../gameplay/constants';
import { GameScene } from '../gameplay/components/GameScene';

export function LevelRunScreen() {
  const { levelId } = useParams();
  const { startLevelRun } = useMazeyApp();
  const level = LEVELS.find((currentLevel) => currentLevel.id === Number(levelId));

  useEffect(() => {
    if (level) {
      startLevelRun(level);
    }
  }, [level, startLevelRun]);

  if (!level) {
    return <Navigate to="/levels" replace />;
  }

  return <GameScene />;
}
