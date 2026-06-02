import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { GlobalAlert } from './components/GlobalAlert';
import { Home } from './pages/Home';
import { Setup } from './pages/Setup';
import { Words } from './pages/Words';
import { News } from './pages/News';
import { Writing } from './pages/Writing';
import { Dictionary } from './pages/Dictionary';
import { useAppStore } from './store/useAppStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const hasConfigured = useAppStore(state => state.hasConfigured);
  
  if (!hasConfigured) {
    return <Navigate to="/setup" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  const theme = useAppStore(state => state.theme);

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
            <Route path="/setup" element={<Setup />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/words" element={<ProtectedRoute><Words /></ProtectedRoute>} />
            <Route path="/news" element={<ProtectedRoute><News /></ProtectedRoute>} />
            <Route path="/writing" element={<ProtectedRoute><Writing /></ProtectedRoute>} />
            <Route path="/dictionary" element={<ProtectedRoute><Dictionary /></ProtectedRoute>} />
          </Routes>
        </Layout>
      </Router>
      <GlobalAlert />
    </>
  );
}

