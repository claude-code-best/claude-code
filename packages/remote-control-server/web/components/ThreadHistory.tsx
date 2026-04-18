import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Clock, RefreshCw } from "lucide-react";
import type { ACPClient } from "../src/acp/client";
import type { AgentSessionInfo } from "../src/acp/types";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { cn } from "../src/lib/utils";

// Reference: Zed's TimeBucket in thread_history.rs
type TimeBucket = "today" | "yesterday" | "thisWeek" | "pastWeek" | "all";

// Reference: Zed's Display impl for TimeBucket
const BUCKET_LABELS: Record<TimeBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  pastWeek: "Past Week",
  all: "All",  // Zed uses "All", not "Older"
};

// Reference: Zed's TimeBucket::from_dates (line 1028-1051)
// Rust's IsoWeek includes year, so we need to compare both year and week number
function getTimeBucket(date: Date): TimeBucket {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (entryDate.getTime() === today.getTime()) return "today";
  if (entryDate.getTime() === yesterday.getTime()) return "yesterday";

  // This week: same ISO week AND year
  const todayIsoWeek = getISOWeekYear(today);
  const entryIsoWeek = getISOWeekYear(entryDate);
  if (todayIsoWeek.year === entryIsoWeek.year && todayIsoWeek.week === entryIsoWeek.week) {
    return "thisWeek";
  }

  // Past week: (reference - 7days).iso_week()
  const lastWeekDate = new Date(today);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekIsoWeek = getISOWeekYear(lastWeekDate);
  if (lastWeekIsoWeek.year === entryIsoWeek.year && lastWeekIsoWeek.week === entryIsoWeek.week) {
    return "pastWeek";
  }

  return "all";
}

// Returns ISO week number AND ISO week year (important for year boundaries)
function getISOWeekYear(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };  // ISO week year, not calendar year
}

// Reference: Zed's formatted_time in HistoryEntryElement (line 904-921)
// Exact format: Xd, Xh ago, Xm ago, Just now, Unknown
function formatRelativeTime(date: Date | null): string {
  if (!date) return "Unknown";  // Zed uses "Unknown" for missing updatedAt

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMinutes > 0) return `${diffMinutes}m ago`;
  return "Just now";
}

interface ThreadHistoryProps {
  client: ACPClient;
  // Returns Promise to allow loading state tracking; resolves when session is loaded
  onSelectSession: (session: AgentSessionInfo) => void | Promise<void>;
}

interface GroupedSessions {
  bucket: TimeBucket;
  sessions: AgentSessionInfo[];
}

export function ThreadHistory({ client, onSelectSession }: ThreadHistoryProps) {
  const [sessions, setSessions] = useState<AgentSessionInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  // Start with isLoading=true to prevent flash of "no threads" message
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Track which session is currently being loaded to show loading state and prevent double-clicks
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  // Check if session history is supported
  const supportsHistory = client.supportsSessionHistory;

  const loadSessions = useCallback(async () => {
    if (!client.supportsSessionList) {
      setError("Session list not supported by this agent");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await client.listSessions();
      setSessions(response.sessions);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (supportsHistory) {
      loadSessions();
    } else {
      // Not supported, clear loading state
      setIsLoading(false);
    }
  }, [supportsHistory, loadSessions]);

  // Filter and group sessions
  // Reference: Zed's add_list_separators and filter_search_results
  const groupedSessions = useMemo((): GroupedSessions[] => {
    let filtered = sessions;

    // Simple search filter (Zed uses fuzzy matching, we use substring for simplicity)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = sessions.filter(
        (s) => s.title?.toLowerCase().includes(query) || s.sessionId.toLowerCase().includes(query)
      );
    }

    // Sort by updatedAt descending (most recent first)
    // Zed expects the API to return sorted data, but we ensure it client-side
    const sorted = [...filtered].sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;  // Descending
    });

    // Group by time bucket (preserving sort order within each bucket)
    const groups = new Map<TimeBucket, AgentSessionInfo[]>();
    for (const session of sorted) {
      const date = session.updatedAt ? new Date(session.updatedAt) : new Date(0);
      const bucket = getTimeBucket(date);
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket)!.push(session);
    }

    // Return in chronological bucket order
    const bucketOrder: TimeBucket[] = ["today", "yesterday", "thisWeek", "pastWeek", "all"];
    return bucketOrder
      .filter((b) => groups.has(b))
      .map((bucket) => ({ bucket, sessions: groups.get(bucket)! }));
  }, [sessions, searchQuery]);

  const handleSelectSession = useCallback(
    async (session: AgentSessionInfo) => {
      // Prevent double-clicks while loading
      if (loadingSessionId) return;

      setLoadingSessionId(session.sessionId);
      try {
        await onSelectSession(session);
      } finally {
        setLoadingSessionId(null);
      }
    },
    [onSelectSession, loadingSessionId]
  );

  if (!supportsHistory) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Session history is not supported by this agent.</p>
      </div>
    );
  }

  const flatItems = groupedSessions.flatMap((g) => g.sessions);

  return (
    <div className="flex flex-col h-full">
      {/* Search header - Reference: Zed's search_editor */}
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Search threads..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 border-0 focus-visible:ring-0 shadow-none"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSessions}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1 min-h-0">
        {error && (
          <div className="p-4 text-center text-destructive text-sm">{error}</div>
        )}

        {!error && isLoading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin mb-2" />
            <p className="text-muted-foreground text-sm">Loading threads...</p>
          </div>
        )}

        {!error && !isLoading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <p className="text-muted-foreground text-sm">
              You don't have any past threads yet.
            </p>
          </div>
        )}

        {!error && sessions.length > 0 && groupedSessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No threads match your search.
            </p>
          </div>
        )}

        {/* p-2 ensures rounded corners of buttons are not clipped */}
        <div className="p-2">
          {groupedSessions.map((group, groupIndex) => (
            <div key={group.bucket}>
              {/* Bucket separator - Reference: Zed's BucketSeparator */}
              <div className={cn("px-2 pb-1", groupIndex > 0 && "pt-3")}>
                <span className="text-xs text-muted-foreground font-medium">
                  {BUCKET_LABELS[group.bucket]}
                </span>
              </div>

              {/* Session entries */}
              {group.sessions.map((session) => {
                const globalIdx = flatItems.indexOf(session);
                const isSelected = globalIdx === selectedIndex;
                const isLoadingThis = loadingSessionId === session.sessionId;
                const isAnyLoading = loadingSessionId !== null;
                const date = session.updatedAt ? new Date(session.updatedAt) : null;

                return (
                  <button
                    key={session.sessionId}
                    disabled={isAnyLoading}
                    onClick={() => {
                      setSelectedIndex(globalIdx);
                      handleSelectSession(session);
                    }}
                    className={cn(
                      // min-w-0 is required for truncate to work in flex containers
                      "w-full min-w-0 flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors",
                      "hover:bg-accent",
                      isSelected && "bg-accent",
                      isAnyLoading && !isLoadingThis && "opacity-50 cursor-not-allowed",
                      isLoadingThis && "bg-accent"
                    )}
                  >
                    {/* min-w-0 + truncate ensures long titles are clipped with ellipsis */}
                    <span className="text-sm truncate flex-1 min-w-0">
                      {session.title && session.title.trim() ? session.title : "New Thread"}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                      {isLoadingThis ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        formatRelativeTime(date)
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

