import { useState, useRef, useCallback } from "react";
import { MessageSquare, History } from "lucide-react";
import type { ACPClient } from "../src/acp/client";
import type { AgentSessionInfo } from "../src/acp/types";
import { ChatInterface } from "./ChatInterface";
import { ThreadHistory } from "./ThreadHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface ACPMainProps {
  client: ACPClient;
}

const TAB_ORDER = ["chat", "history"] as const;
type TabValue = (typeof TAB_ORDER)[number];

/**
 * Main container component that provides tabs for Chat and History.
 * Reference: Zed's AgentPanel with ThreadHistory integration
 * This component should be rendered after successful connection.
 */
export function ACPMain({ client }: ACPMainProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("chat");
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Handle session selection from history
  // Reference: Zed's connection_view.rs line 616-631
  // Zed prioritizes load_session (with history), falls back to resume_session (without history)
  const handleSelectSession = useCallback(async (session: AgentSessionInfo) => {
    try {
      if (client.supportsLoadSession) {
        // load_session replays full history
        await client.loadSession({ sessionId: session.sessionId, cwd: session.cwd });
      } else if (client.supportsResumeSession) {
        // resume_session starts without replaying history
        await client.resumeSession({ sessionId: session.sessionId, cwd: session.cwd });
      } else {
        throw new Error("Loading or resuming sessions is not supported by this agent.");
      }
      // Switch to chat tab after loading
      setActiveTab("chat");
    } catch (error) {
      console.error("Failed to load/resume session:", error);
    }
  }, [client]);

  // Check if an element or its ancestors can scroll horizontally
  const isInHorizontalScrollableArea = useCallback((element: HTMLElement | null): boolean => {
    while (element) {
      if (element.scrollWidth > element.clientWidth) {
        const style = window.getComputedStyle(element);
        const overflowX = style.overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          return true;
        }
      }
      element = element.parentElement;
    }
    return false;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't track swipe if starting in a horizontally scrollable area
    if (isInHorizontalScrollableArea(e.target as HTMLElement)) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, [isInHorizontalScrollableArea]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Only trigger if horizontal swipe is dominant and significant
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      const currentIndex = TAB_ORDER.indexOf(activeTab);
      if (deltaX < 0 && currentIndex < TAB_ORDER.length - 1) {
        // Swipe left → next tab
        setActiveTab(TAB_ORDER[currentIndex + 1]);
      } else if (deltaX > 0 && currentIndex > 0) {
        // Swipe right → previous tab
        setActiveTab(TAB_ORDER[currentIndex - 1]);
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [activeTab]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as TabValue)}
      className="flex flex-col h-full w-full"
    >
      <TabsList className="mx-2 mt-2 self-center">
        <TabsTrigger value="chat" className="gap-1.5">
          <MessageSquare className="h-4 w-4" />
          <span>Chat</span>
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-1.5">
          <History className="h-4 w-4" />
          <span>History</span>
        </TabsTrigger>
      </TabsList>

      <div
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <TabsContent value="chat" forceMount className="w-full h-full m-0 max-w-2xl mx-auto">
          <ChatInterface client={client} />
        </TabsContent>

        <TabsContent value="history" forceMount className="flex flex-col h-full m-0 max-w-2xl mx-auto w-full">
          <ThreadHistory client={client} onSelectSession={handleSelectSession} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
