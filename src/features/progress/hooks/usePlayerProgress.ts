import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUserProfile, updateBestTime } from '../../../api';
import type { User } from '../../../firebase';
import { LEVELS } from '../../gameplay/constants';

function normalizeBestTimes(
  bestTimes: Record<string, number>,
): Record<number, number> {
  return Object.fromEntries(
    Object.entries(bestTimes).map(([levelId, time]) => [Number(levelId), time]),
  ) as Record<number, number>;
}

export function usePlayerProgress(user: User | null, isAuthLoading: boolean) {
  const [bestTimes, setBestTimes] = useState<Record<number, number>>({});
  const [isNewBest, setIsNewBest] = useState(false);
  const userId = user?.uid ?? null;
  const loadedUserIdRef = useRef<string | null>(null);

  const getStarsForTime = useCallback((levelId: number, time: number) => {
    const level = LEVELS.find((currentLevel) => currentLevel.id === levelId);

    if (!level) {
      return 0;
    }

    if (time <= level.starTimes[0]) return 3;
    if (time <= level.starTimes[1]) return 2;
    if (time <= level.starTimes[2]) return 1;

    return 0;
  }, []);

  const totalStars = useMemo(
    () =>
      Object.entries(bestTimes).reduce((acc, [levelId, time]) => {
        return acc + getStarsForTime(Number(levelId), time);
      }, 0),
    [bestTimes, getStarsForTime],
  );

  useEffect(() => {
    const loadProgress = async () => {
      const saved = localStorage.getItem('neon_rush_best_times');
      const localBestTimes = saved
        ? (JSON.parse(saved) as Record<number, number>)
        : {};

      setBestTimes(localBestTimes);

      if (!userId) {
        loadedUserIdRef.current = null;
        return;
      }

      if (loadedUserIdRef.current === userId) {
        return;
      }

      loadedUserIdRef.current = userId;

      try {
        const profile = await getCurrentUserProfile();
        const remoteBestTimes = normalizeBestTimes(profile.bestTimes);
        const merged = { ...localBestTimes, ...remoteBestTimes };
        setBestTimes(merged);
        localStorage.setItem('neon_rush_best_times', JSON.stringify(merged));
      } catch (error) {
        loadedUserIdRef.current = null;
        console.error('Failed to load progress from the API:', error);
      }
    };

    if (!isAuthLoading) {
      void loadProgress();
    }
  }, [userId, isAuthLoading]);

  const saveBestTime = useCallback(
    async (levelId: number, time: number) => {
      const currentBest = bestTimes[levelId];

      if (!currentBest || time < currentBest) {
        setIsNewBest(true);
        const newBestTimes = { ...bestTimes, [levelId]: time };
        setBestTimes(newBestTimes);
        localStorage.setItem('neon_rush_best_times', JSON.stringify(newBestTimes));

        if (user) {
          try {
            const profile = await updateBestTime(levelId, time);
            const syncedBestTimes = normalizeBestTimes(profile.bestTimes);
            setBestTimes(syncedBestTimes);
            localStorage.setItem(
              'neon_rush_best_times',
              JSON.stringify(syncedBestTimes),
            );
          } catch (error) {
            console.error('Failed to save best time through the API:', error);
          }
        }
      }
    },
    [bestTimes, user],
  );

  return {
    bestTimes,
    setBestTimes,
    isNewBest,
    setIsNewBest,
    getStarsForTime,
    totalStars,
    saveBestTime,
  };
}
