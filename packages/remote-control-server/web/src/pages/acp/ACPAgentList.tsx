import { useState, useEffect, useCallback } from "react";
import { Bot, ChevronRight, RefreshCw, Globe } from "lucide-react";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { StatusDot } from "../../../components/ui/connection-status";
import { ThemeToggle } from "../../../components/ui/theme-toggle";
import { cn } from "../../lib/utils";

interface Agent {
  id: string;
  agent_name: string;
  channel_group_id: string;
  status: "online" | "offline";
  max_sessions: number;
  last_seen_at: number | null;
  created_at: number;
}

interface ChannelGroup {
  channel_group_id: string;
  member_count: number;
  members: Agent[];
}

interface ACPAgentListProps {
  onSelectAgent: (agentId: string) => void;
}

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function ACPAgentList({ onSelectAgent }: ACPAgentListProps) {
  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchApi<ChannelGroup[]>("/acp/channel-groups");
      setGroups(data || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const totalAgents = groups.reduce((sum, g) => sum + g.member_count, 0);
  const onlineAgents = groups.reduce(
    (sum, g) => sum + g.members.filter((m) => m.status === "online").length,
    0,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-surface-1">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-brand" />
          <h1 className="font-display text-lg font-semibold">ACP Agents</h1>
          <span className="text-sm text-text-muted">
            {onlineAgents}/{totalAgents} online
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-1.5 rounded-md hover:bg-surface-2 transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4 text-text-muted", isLoading && "animate-spin")} />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {isLoading && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="h-8 w-8 text-text-muted animate-spin mb-3" />
              <p className="text-text-muted">Loading agents...</p>
            </div>
          )}

          {!isLoading && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Bot className="h-12 w-12 text-text-muted mb-4" />
              <h2 className="text-lg font-medium mb-2">No agents registered</h2>
              <p className="text-text-muted text-sm text-center max-w-md">
                Start an acp-link instance with <code className="bg-surface-2 px-1.5 py-0.5 rounded text-xs">ACP_RCS_URL</code> configured to register agents here.
              </p>
            </div>
          )}

          {groups.map((group) => (
            <section key={group.channel_group_id} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-text-muted" />
                <h2 className="font-display text-sm font-semibold text-text-secondary">
                  {group.channel_group_id}
                </h2>
                <span className="text-xs text-text-muted">
                  {group.member_count} agent{group.member_count !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-1">
                {group.members.map((agent) => {
                  const isOnline = agent.status === "online";
                  const lastSeen = agent.last_seen_at
                    ? new Date(agent.last_seen_at * 1000).toLocaleTimeString()
                    : "Never";

                  return (
                    <button
                      key={agent.id}
                      onClick={() => isOnline && onSelectAgent(agent.id)}
                      disabled={!isOnline}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left",
                        isOnline
                          ? "border-border hover:bg-surface-1 cursor-pointer"
                          : "border-border/50 bg-surface-2/50 cursor-not-allowed opacity-60",
                      )}
                    >
                      <StatusDot
                        state={isOnline ? "connected" : "disconnected"}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {agent.agent_name}
                          </span>
                          {!isOnline && (
                            <span className="text-xs text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                              Offline
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">
                          ID: {agent.id.slice(0, 16)}...
                          {agent.last_seen_at && ` · Last seen: ${lastSeen}`}
                        </div>
                      </div>
                      {isOnline && (
                        <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
