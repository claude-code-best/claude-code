import { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "../../lib/theme";
import { ACPAgentList } from "./ACPAgentList";
import { ACPAgentView } from "./ACPAgentView";
import { getTokenFromAcpUrl } from "../../acp/relay-client";

export function ACPApp() {
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [token, setToken] = useState<string | undefined>(undefined);

  // Parse route from URL
  const parseRoute = useCallback(() => {
    // Extract token from URL
    const urlToken = getTokenFromAcpUrl();
    if (urlToken) {
      setToken(urlToken);
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState(null, "", url);
    }

    // Path routing: /acp/agent/:agentId → agent view
    const path = window.location.pathname;
    const match = path.match(/^\/acp\/agent\/([^/]+)/);
    if (match && match[1]) {
      setCurrentAgentId(match[1]);
    } else {
      setCurrentAgentId(null);
    }
  }, []);

  useEffect(() => {
    parseRoute();
    window.addEventListener("popstate", parseRoute);
    return () => window.removeEventListener("popstate", parseRoute);
  }, [parseRoute]);

  const navigateToAgent = useCallback((agentId: string) => {
    window.history.pushState(null, "", `/acp/agent/${agentId}`);
    setCurrentAgentId(agentId);
  }, []);

  const navigateToList = useCallback(() => {
    window.history.pushState(null, "", "/acp/");
    setCurrentAgentId(null);
  }, []);

  return (
    <ThemeProvider defaultTheme="light">
      <div className="flex h-screen flex-col bg-surface-0 text-text-primary">
        {currentAgentId ? (
          <ACPAgentView
            agentId={currentAgentId}
            token={token}
            onBack={navigateToList}
          />
        ) : (
          <ACPAgentList
            onSelectAgent={navigateToAgent}
          />
        )}
      </div>
    </ThemeProvider>
  );
}
