import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { ACPClient, DisconnectRequestedError } from "../../acp/client";
import { createRelayClient } from "../../acp/relay-client";
import { ACPMain } from "../../../components/ACPMain";
import { StatusDot } from "../../../components/ui/connection-status";

interface ACPAgentViewProps {
  agentId: string;
  token?: string;
  onBack: () => void;
}

export function ACPAgentView({ agentId, token, onBack }: ACPAgentViewProps) {
  const [client, setClient] = useState<ACPClient | null>(null);
  const [connectionState, setConnectionState] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<ACPClient | null>(null);

  useEffect(() => {
    const relayClient = createRelayClient(agentId, token);

    relayClient.setConnectionStateHandler((state, err) => {
      setConnectionState(state);
      setError(err || null);
    });

    clientRef.current = relayClient;
    setClient(relayClient);

    // Connect to relay
    relayClient.connect().catch((e) => {
      if (e instanceof DisconnectRequestedError) return;
      setError((e as Error).message);
      setConnectionState("error");
    });

    return () => {
      relayClient.disconnect();
      clientRef.current = null;
      setClient(null);
      setConnectionState("disconnected");
    };
  }, [agentId, token]);

  const handleBack = useCallback(() => {
    // Disconnect before navigating back
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    onBack();
  }, [onBack]);

  return (
    <div className="flex flex-col h-full">
      {/* Agent Header */}
      <header className="flex items-center gap-3 px-3 py-2 border-b bg-surface-1 shrink-0">
        <button
          onClick={handleBack}
          className="p-1.5 rounded-md hover:bg-surface-2 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StatusDot state={connectionState} />
          <span className="text-sm font-medium truncate">{agentId}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-text-muted">
          {connectionState === "connected" ? (
            <Wifi className="h-3.5 w-3.5 text-status-active" />
          ) : (
            <WifiOff className="h-3.5 w-3.5" />
          )}
          <span>
            {connectionState === "connecting" && "Connecting..."}
            {connectionState === "connected" && "Connected"}
            {connectionState === "disconnected" && "Disconnected"}
            {connectionState === "error" && "Error"}
          </span>
        </div>
      </header>

      {/* Connection error */}
      {error && connectionState === "error" && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b">
          {error}
        </div>
      )}

      {/* Main content */}
      {connectionState === "connecting" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-text-muted text-sm">Connecting to agent...</p>
          </div>
        </div>
      )}

      {connectionState === "error" && !client && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <WifiOff className="h-12 w-12 text-text-muted mx-auto mb-3" />
            <p className="font-medium mb-1">Connection Failed</p>
            <p className="text-text-muted text-sm">{error}</p>
          </div>
        </div>
      )}

      {client && connectionState === "connected" && (
        <div className="flex-1 min-h-0">
          <ACPMain client={client} />
        </div>
      )}
    </div>
  );
}
