import { useState, useEffect, useCallback } from 'react';
import { apiFetchAllSessions, apiFetchEnvironments } from '../api/client';
import type { Session, Environment } from '../types';
import { EnvironmentList } from '../components/EnvironmentList';
import { SessionList } from '../components/SessionList';
import { NewSessionDialog } from '../components/NewSessionDialog';

interface DashboardProps {
  onNavigateSession: (sessionId: string) => void;
}

export function Dashboard({ onNavigateSession }: DashboardProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const [sess, envs] = await Promise.all([apiFetchAllSessions(), apiFetchEnvironments()]);
      setSessions(sess || []);
      setEnvironments(envs || []);
    } catch (err) {
      console.error('Dashboard render error:', err);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  const handleSessionCreated = (session: Session) => {
    setDialogOpen(false);
    onNavigateSession(session.id);
  };

  const handleSelectEnvironment = useCallback((_env: Environment) => {
    // ACP agents require WebSocket connection and cannot be navigated to directly
    // Bridge environments: no direct navigation (sessions are listed below)
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      onNavigateSession(sessionId);
    },
    [onNavigateSession],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="sr-only">Dashboard</h1>
      {/* Environments */}
      <section className="mb-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-text-primary">Environments</h2>
        <EnvironmentList environments={environments} onSelectEnvironment={handleSelectEnvironment} />
      </section>

      {/* Sessions */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-text-primary">Sessions</h2>
          <button
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-light transition-colors"
          >
            + New Session
          </button>
        </div>
        <SessionList sessions={sessions} onSelect={handleSelectSession} />
      </section>

      <NewSessionDialog
        open={dialogOpen}
        environments={environments}
        onClose={() => setDialogOpen(false)}
        onCreated={handleSessionCreated}
      />
    </div>
  );
}
