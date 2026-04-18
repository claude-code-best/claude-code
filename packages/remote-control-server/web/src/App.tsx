import { useState, useEffect, useCallback } from "react";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { SessionDetail } from "./pages/SessionDetail";
import { IdentityPanel } from "./components/IdentityPanel";
import { ThemeProvider } from "./lib/theme";
import { getUuid, setUuid, apiBind } from "./api/client";

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);

  // Simple hash-based router
  const parseRoute = useCallback(() => {
    // Ensure UUID exists
    getUuid();

    const path = window.location.pathname;

    // Check for UUID import from QR scan (?uuid=xxx)
    const params = new URLSearchParams(window.location.search);
    const importUuid = params.get("uuid");
    if (importUuid) {
      setUuid(importUuid);
      const url = new URL(window.location.href);
      url.searchParams.delete("uuid");
      window.history.replaceState(null, "", url);
    }

    // Check for CLI session bind (?sid=xxx) — bind session to current UUID
    const sid = params.get("sid");
    if (sid) {
      const url = new URL(window.location.href);
      url.searchParams.delete("sid");
      window.history.replaceState(null, "", `/code/${sid}`);
      setCurrentSessionId(sid);
      // Bind this session to the current user's UUID for ownership
      apiBind(sid).catch((err: unknown) => {
        console.warn("Failed to bind session:", err);
      });
      return;
    }

    // Path-based routing: /code/session_xxx → session detail
    const match = path.match(/^\/code\/([^/]+)/);
    if (match && match[1]) {
      setCurrentSessionId(match[1]);
    } else {
      setCurrentSessionId(null);
    }
  }, []);

  useEffect(() => {
    parseRoute();
    window.addEventListener("popstate", parseRoute);
    return () => window.removeEventListener("popstate", parseRoute);
  }, [parseRoute]);

  const navigateToSession = useCallback((sessionId: string) => {
    window.history.pushState(null, "", `/code/${sessionId}`);
    setCurrentSessionId(sessionId);
  }, []);

  const navigateToDashboard = useCallback(() => {
    window.history.pushState(null, "", "/code/");
    setCurrentSessionId(null);
  }, []);

  return (
    <ThemeProvider defaultTheme="light">
      <div className="flex h-screen flex-col bg-surface-0 text-text-primary">
        <Navbar onIdentityClick={() => setIdentityOpen(true)} />

        {currentSessionId ? (
          <SessionDetail key={currentSessionId} sessionId={currentSessionId} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <Dashboard onNavigateSession={navigateToSession} />
          </div>
        )}

        <IdentityPanel open={identityOpen} onClose={() => setIdentityOpen(false)} />
      </div>
    </ThemeProvider>
  );
}
