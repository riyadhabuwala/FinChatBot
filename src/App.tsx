import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import SharePage from './pages/SharePage';
import { useEffect } from 'react';
import useChatStore from './store/useChatStore';

function App() {
  const setToken = useChatStore(state => state.setAuthToken);
  const setUser = useChatStore(state => state.setUser);
  const setAgentRunHistory = useChatStore(state => state.setAgentRunHistory);
  const authToken = useChatStore(state => state.authToken);

  useEffect(() => {
    // Optionally pre-fetch agent history if auth token exists
    const fetchHistory = async () => {
      if (authToken) {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/agent/history`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          const data = await res.json();
          if (data.runs) {
            setAgentRunHistory(data.runs);
          }
        } catch (e) {
          console.error("Failed to fetch agent history:", e);
        }
      }
    };
    fetchHistory();
  }, [authToken, setAgentRunHistory]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/share/:slug" element={<SharePage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
