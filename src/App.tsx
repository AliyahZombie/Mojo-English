import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { GlobalAlert } from './components/GlobalAlert';
import { Home } from './pages/Home';
import { Setup } from './pages/Setup';
import { OOBE } from './pages/OOBE';
import { Words } from './pages/Words';
import { News } from './pages/News';
import { Writing } from './pages/Writing';
import { Dictionary } from './pages/Dictionary';
import { Decks } from './pages/Decks';
import { Stories } from './pages/Stories';
import { SetupNotification } from './pages/SetupNotification';
import { useAppStore } from './store/useAppStore';
import { useMojoAnalytics } from './hooks/useMojoAnalytics';
import { usePwaUpdate } from './hooks/usePwaUpdate';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const hasConfigured = useAppStore(state => state.hasConfigured);

  if (!hasConfigured) {
    return <Navigate to="/oobe" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const theme = useAppStore(state => state.theme);
  useMojoAnalytics();
  usePwaUpdate();

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <>
      <Router>
        <Layout>
          <Routes>
            <Route path="/oobe" element={<OOBE />} />
            <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/words" element={<ProtectedRoute><Words /></ProtectedRoute>} />
            <Route path="/news" element={<ProtectedRoute><News /></ProtectedRoute>} />
            <Route path="/writing" element={<ProtectedRoute><Writing /></ProtectedRoute>} />
            <Route path="/dictionary" element={<ProtectedRoute><Dictionary /></ProtectedRoute>} />
            <Route path="/decks" element={<ProtectedRoute><Decks /></ProtectedRoute>} />
            <Route path="/stories" element={<ProtectedRoute><Stories /></ProtectedRoute>} />
            <Route path="/setupNotification" element={<ProtectedRoute><SetupNotification /></ProtectedRoute>} />
          </Routes>
        </Layout>
      </Router>
      <GlobalAlert />
    </>
  );
}
