import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/button";
import { StatusDot } from "./ui/connection-status";
import { ThemeToggle } from "./ui/theme-toggle";
import { Label } from "./ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "./ui/input-group";
import { ACPClient, DEFAULT_SETTINGS, DisconnectRequestedError } from "../src/acp";
import type { ACPSettings, ConnectionState, BrowserToolParams, BrowserToolResult } from "../src/acp";
import { ChevronDown, FolderOpen, Globe, Image, KeyRound, ScanLine, X } from "lucide-react";
import { useQRScanner, type QRCodeData } from "../src/hooks";

// Get token from the URL fragment so it is not sent in HTTP requests.
function getTokenFromUrl(): string | undefined {
  try {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    return hashParams.get("token") || undefined;
  } catch {
    return undefined;
  }
}

// Infer WebSocket URL from current page URL (for pre-filled links from server)
// e.g., http://localhost:9315/app#token=xxx -> ws://localhost:9315/ws
function inferProxyUrlFromPage(): string | undefined {
  try {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    // Only infer if we have a fragment token (indicates user came from server-printed URL)
    if (!hashParams.has("token")) {
      return undefined;
    }
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}/ws`;
  } catch {
    return undefined;
  }
}

function scrubTokenFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    if (!hashParams.has("token")) {
      return;
    }

    hashParams.delete("token");
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : "";
    window.history.replaceState(null, "", url.toString());
  } catch {
    return;
  }
}

// Get initial settings from defaults, with optional URL overrides
function getInitialSettings(inferFromUrl: boolean): ACPSettings {
  const settings = { ...DEFAULT_SETTINGS };

  // Override from URL if enabled (for pre-filled links from server)
  if (inferFromUrl) {
    const urlToken = getTokenFromUrl();
    const inferredUrl = inferProxyUrlFromPage();

    if (urlToken) {
      settings.token = urlToken;
    }
    if (inferredUrl) {
      settings.proxyUrl = inferredUrl;
    }
  }

  return settings;
}

export interface ACPConnectProps {
  onClientReady?: (client: ACPClient | null) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Handler for browser tool calls (only Chrome extension can execute these) */
  browserToolHandler?: (params: BrowserToolParams) => Promise<BrowserToolResult>;
  /** Show token input field (for remote access) */
  showTokenInput?: boolean;
  /** Infer proxy URL and token from page URL (for PWA) */
  inferFromUrl?: boolean;
  /** Placeholder for proxy URL input */
  placeholder?: string;
  /** Show QR code scan button (for mobile) */
  showScanButton?: boolean;
}

export function ACPConnect({
  onClientReady,
  expanded,
  onExpandedChange,
  browserToolHandler,
  showTokenInput = false,
  inferFromUrl = false,
  placeholder = "Proxy server URL",
  showScanButton = false,
}: ACPConnectProps) {
  const [settings, setSettings] = useState<ACPSettings>(() => getInitialSettings(inferFromUrl));
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [client, setClient] = useState<ACPClient | null>(null);
  const [maxHeight, setMaxHeight] = useState<number>(200);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasAutoCollapsedRef = useRef(false);
  const pendingAutoConnectRef = useRef(false);
  // Store initial settings in a ref to avoid eslint warning about empty deps
  const initialSettingsRef = useRef<ACPSettings>(settings);

  // QR Scanner hook
  const handleQRScan = useCallback((data: QRCodeData) => {
    // Mark for auto-connect (will be triggered by settings useEffect)
    pendingAutoConnectRef.current = true;
    // Update settings - this will trigger auto-connect via useEffect
    setSettings((prev) => ({
      ...prev,
      proxyUrl: data.url,
      token: data.token,
    }));
  }, []);

  const handleQRError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  const { isScanning, videoRef, startScanning, stopScanning, scanFromFile } = useQRScanner({
    onScan: handleQRScan,
    onError: handleQRError,
  });

  useLayoutEffect(() => {
    if (inferFromUrl) {
      scrubTokenFromUrl();
    }
  }, [inferFromUrl]);

  // Recalculate maxHeight after DOM updates (when expanded or isScanning changes)
  useLayoutEffect(() => {
    if (expanded && contentRef.current) {
      setMaxHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, isScanning]);

  // File input ref for album scanning
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection from album
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await scanFromFile(file);
        stopScanning(); // Close the scanner overlay after album scan
      }
      // Reset input to allow re-selecting the same file
      e.target.value = "";
    },
    [scanFromFile, stopScanning]
  );

  // Open file picker
  const handleSelectFromAlbum = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Initialize client once on mount using initial settings from ref
  useEffect(() => {
    const acpClient = new ACPClient(initialSettingsRef.current);
    acpClient.setConnectionStateHandler((state, err) => {
      setConnectionState(state);
      setError(err || null);
    });

    setClient(acpClient);

    return () => {
      acpClient.disconnect();
    };
  }, []);

  // Register browser tool handler when it changes
  useEffect(() => {
    if (client && browserToolHandler) {
      client.setBrowserToolCallHandler(browserToolHandler);
    }
  }, [client, browserToolHandler]);

  // Update client settings when settings change, and auto-connect if pending
  useEffect(() => {
    if (client) {
      client.updateSettings(settings);

      // Auto-connect after QR scan (when pendingAutoConnectRef is set)
      if (pendingAutoConnectRef.current) {
        pendingAutoConnectRef.current = false;
        client.connect().catch((e) => {
          // Ignore disconnect requested - user cancelled intentionally
          if (e instanceof DisconnectRequestedError) {
            return;
          }
          setError((e as Error).message);
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 500);
          onExpandedChange(true);
        });
      }
    }
  }, [settings, client, onExpandedChange]);

  // Notify parent when client is ready and auto-collapse on connect
  useEffect(() => {
    const isConnected = connectionState === "connected";
    onClientReady?.(isConnected ? client : null);

    // Auto-collapse when connected for the first time
    if (isConnected && !hasAutoCollapsedRef.current) {
      hasAutoCollapsedRef.current = true;
      onExpandedChange(false);
    }

    // Reset auto-collapse flag when disconnected
    if (connectionState === "disconnected") {
      hasAutoCollapsedRef.current = false;
    }
  }, [connectionState, client, onClientReady, onExpandedChange]);

  const handleConnect = useCallback(async () => {
    // Prevent duplicate connect calls if already connecting or connected
    if (!client || connectionState === "connecting" || connectionState === "connected") {
      return;
    }
    setError(null);
    setIsShaking(false);
    try {
      await client.connect();
    } catch (e) {
      // Ignore disconnect requested - user cancelled intentionally
      if (e instanceof DisconnectRequestedError) {
        return;
      }
      const errorMessage = (e as Error).message;
      setError(errorMessage);
      // Trigger shake animation
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      // Ensure panel is expanded to show error
      onExpandedChange(true);
    }
  }, [client, connectionState, onExpandedChange]);

  const handleDisconnect = useCallback(() => {
    client?.disconnect();
  }, [client]);

  const updateSetting = <K extends keyof ACPSettings>(key: K, value: ACPSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Clear error when starting to scan
  const handleStartScanning = useCallback(() => {
    setError(null);
    startScanning();
  }, [startScanning]);

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConnected && !isConnecting) {
      e.preventDefault();
      handleConnect();
    }
  }, [isConnected, isConnecting, handleConnect]);

  // Format URL for display
  const displayUrl = settings.proxyUrl.replace(/^wss?:\/\//, "").replace(/\/ws$/, "");

  // Get status label
  const statusLabels: Record<ConnectionState, string> = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  };

  return (
    <div className="bg-background/80 backdrop-blur-sm">
      <div className="max-w-md mx-auto border-b">
      {/* Status Bar - Always visible */}
      <button
        onClick={() => onExpandedChange(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <StatusDot state={connectionState} />
          <span className="text-sm font-medium">{statusLabels[connectionState]}</span>
          {isConnected && displayUrl && (
            <span className="text-xs text-muted-foreground">• {displayUrl}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div onClick={(e) => e.stopPropagation()}>
            <ThemeToggle />
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Expandable Settings Panel */}
      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{
          maxHeight: expanded ? maxHeight : 0,
          opacity: expanded ? 1 : 0,
        }}
      >
        <div ref={contentRef} className={`px-3 pb-3 pt-1 space-y-3 ${isShaking ? "animate-shake" : ""}`}>
          {/* Hidden file input for album scanning */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* QR Scanner View - Portal to body to escape backdrop-blur containing block */}
          {isScanning && createPortal(
            <div className="fixed inset-0 z-50 bg-black flex flex-col">
              <video
                ref={videoRef}
                className="flex-1 w-full object-cover"
              />
              <Button
                onClick={stopScanning}
                variant="ghost"
                size="sm"
                className="absolute top-4 right-4 h-10 w-10 p-0 bg-black/50 hover:bg-black/70 text-white rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-3">
                <Button
                  onClick={handleSelectFromAlbum}
                  variant="secondary"
                  size="sm"
                  className="h-9 px-4"
                >
                  <Image className="h-4 w-4 mr-2" />
                  Select from Album
                </Button>
                <span className="text-sm text-white/80">
                  or point camera at QR code
                </span>
              </div>
            </div>,
            document.body
          )}

          {/* Connection Settings - use invisible (not hidden) to preserve scrollHeight for animation */}
          <div className={`space-y-3 ${isScanning ? "invisible" : ""}`}>
              {/* Server URL */}
              <div className="space-y-1.5">
                <Label htmlFor="proxy-url">Server</Label>
                <div className="flex gap-2">
                  {showScanButton && !isConnected && !isConnecting && (
                    <Button
                      onClick={handleStartScanning}
                      variant="outline"
                      size="sm"
                      className="h-9 px-3"
                      title="Scan QR code"
                      type="button"
                    >
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  )}
                  <InputGroup className="flex-1" data-disabled={isConnected || isConnecting}>
                    <InputGroupAddon>
                      <Globe />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="proxy-url"
                      value={settings.proxyUrl}
                      onChange={(e) => updateSetting("proxyUrl", e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      placeholder={placeholder}
                      disabled={isConnected || isConnecting}
                      aria-invalid={!!error}
                    />
                  </InputGroup>
                  {!isConnected ? (
                    <Button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      size="sm"
                      className="h-9 px-4"
                      type="button"
                    >
                      {isConnecting ? "..." : "Connect"}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleDisconnect}
                      variant="destructive"
                      size="sm"
                      className="h-9 px-4"
                      type="button"
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>

              {/* Auth Token - only shown if enabled */}
              {showTokenInput && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-token">
                    Auth Token
                    <span className="text-muted-foreground font-normal ml-1.5">optional</span>
                  </Label>
                  <InputGroup data-disabled={isConnected || isConnecting}>
                    <InputGroupAddon>
                      <KeyRound />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="auth-token"
                      value={settings.token || ""}
                      onChange={(e) => updateSetting("token", e.target.value || undefined)}
                      onKeyDown={handleInputKeyDown}
                      placeholder="For remote access"
                      disabled={isConnected || isConnecting}
                      type="password"
                      aria-invalid={!!error}
                      className="font-mono"
                    />
                  </InputGroup>
                </div>
              )}

              {/* Working Directory */}
              <div className="space-y-1.5">
                <Label htmlFor="working-dir">
                  Working Directory
                  <span className="text-muted-foreground font-normal ml-1.5">optional</span>
                </Label>
                <InputGroup data-disabled={isConnected || isConnecting}>
                  <InputGroupAddon>
                    <FolderOpen />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="working-dir"
                    value={settings.cwd || ""}
                    onChange={(e) => updateSetting("cwd", e.target.value || undefined)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="/path/to/project"
                    disabled={isConnected || isConnecting}
                    aria-invalid={!!error}
                    className="font-mono"
                  />
                </InputGroup>
              </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">
              {error}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
