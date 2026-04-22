import { BrowserRouter } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { MazeyAppProvider } from './features/app/MazeyAppContext';

export default function App() {
  return (
    <BrowserRouter>
      <MazeyAppProvider>
        <AppShell />
      </MazeyAppProvider>
    </BrowserRouter>
  );
}
