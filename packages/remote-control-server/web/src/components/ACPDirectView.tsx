import { useState, useEffect, useRef } from 'react';
import { ACPClient, DisconnectRequestedError } from '../acp/client';
import type { ConnectionState } from '../acp/types';
import { ACPMain } from '../../components/ACPMain';

interface ACPDirectViewProps {
  url: string;
  token: string;
  onBack: () => void;
}

export function ACPDirectView({ url, token, onBack }: ACPDirectViewProps) {
  const [client, setClient] = useState<ACPClient | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<ACPClient | null>(null);

  useEffect(() => {
    const acpClient = new ACPClient({ proxyUrl: url, token });

    acpClient.setConnectionStateHandler((state, err) => {
      setConnectionState(state);
      setError(err || null);
    });

    clientRef.current = acpClient;
    setClient(acpClient);

    acpClient.connect().catch(e => {
      if (e instanceof DisconnectRequestedError) return;
      setError((e as Error).message);
      setConnectionState('error');
    });

    return () => {
      acpClient.disconnect();
      clientRef.current = null;
      setClient(null);
      setConnectionState('disconnected');
    };
  }, [url, token]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {error && connectionState === 'error' && (
        <div className="px-4 py-2 bg-status-error/10 text-status-error text-sm border-b">
          {error}
          <button onClick={onBack} className="ml-3 underline hover:no-underline">
            Back to Dashboard
          </button>
        </div>
      )}

      {connectionState === 'connecting' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-text-muted text-sm">Connecting to ACP agent...</p>
          </div>
        </div>
      )}

      {connectionState === 'error' && !client && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="font-medium mb-1">Connection Failed</p>
            <p className="text-text-muted text-sm mb-3">{error}</p>
            <button
              onClick={onBack}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {client && connectionState === 'connected' && <ACPMain client={client} />}
    </div>
  );
}
