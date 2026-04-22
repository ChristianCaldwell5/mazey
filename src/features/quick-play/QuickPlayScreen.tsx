import { useEffect } from 'react';
import { GameScene } from '../gameplay/components/GameScene';
import { useMazeyApp } from '../app/MazeyAppContext';

export function QuickPlayScreen() {
  const { startQuickPlay } = useMazeyApp();

  useEffect(() => {
    startQuickPlay();
  }, [startQuickPlay]);

  return <GameScene />;
}
