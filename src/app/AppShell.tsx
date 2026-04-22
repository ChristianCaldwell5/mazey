import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LevelRunScreen } from '../features/levels/LevelRunScreen';
import { LevelsScreen } from '../features/levels/LevelsScreen';
import { MainMenuScreen } from '../features/main-menu/MainMenuScreen';
import { MultiplayerScreen } from '../features/multiplayer/MultiplayerScreen';
import { QuickPlayScreen } from '../features/quick-play/QuickPlayScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

export function AppShell() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Navigate to="/main-menu" replace />} />
        <Route path="/main-menu" element={<MainMenuScreen />} />
        <Route path="/quick-play" element={<QuickPlayScreen />} />
        <Route path="/levels" element={<LevelsScreen />} />
        <Route path="/levels/:levelId" element={<LevelRunScreen />} />
        <Route path="/multiplayer" element={<MultiplayerScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/main-menu" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
