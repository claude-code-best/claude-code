# WEB_BROWSER_TOOL — Browser Tool

> Feature Flag: `FEATURE_WEB_BROWSER_TOOL=1`
> Implementation Status: Core implementation missing, panel is Stub, wiring complete
> Reference Count: 4

## 1. Feature Overview

WEB_BROWSER_TOOL allows the model to launch browser instances, navigate web pages, and interact with page elements. Uses Bun's built-in WebView API to provide headless/headed browser capabilities.

## 2. Implementation Architecture

### 2.1 Module Status

| Module | File | Status |
|--------|------|--------|
| Browser Panel | `src/tools/WebBrowserTool/WebBrowserPanel.ts` | **Stub** — returns null |
| Browser Tool | `src/tools/WebBrowserTool/WebBrowserTool.ts` | **Missing** |
| REPL Integration | `src/screens/REPL.tsx` | **Wired** — renders WebBrowserPanel |
| Tool Registration | `src/tools.ts` | **Wired** — dynamic loading |
| WebView Detection | `src/main.tsx` | **Wired** — `'WebView' in Bun` detection |

### 2.2 Expected Data Flow

```
Model calls WebBrowserTool
         |
         v
Bun WebView creates browser instance
         |
         +-- navigate(url) — navigate to URL
         +-- click(selector) — click element
         +-- screenshot() — capture page screenshot
         +-- extract(selector) — extract page content
         |
         v
Results returned to model
         |
         v
WebBrowserPanel displays browser state in REPL sidebar
```

## 3. Content Needing Implementation

| Module | Effort | Description |
|--------|--------|-------------|
| `WebBrowserTool.ts` | Large | Tool schema + Bun WebView API execution |
| `WebBrowserPanel.tsx` | Medium | REPL sidebar browser state panel |

## 4. Key Design Decisions

1. **Bun WebView API**: Uses Bun's built-in WebView instead of external browser drivers (Puppeteer/Playwright)
2. **REPL Sidebar Panel**: Browser state rendered independently in REPL layout
3. **Bun Feature Detection**: `'WebView' in Bun` checks runtime support

## 5. Usage

```bash
FEATURE_WEB_BROWSER_TOOL=1 bun run dev
```

## 6. File Index

| File | Responsibility |
|------|----------------|
| `src/tools/WebBrowserTool/WebBrowserPanel.ts` | Panel component (stub) |
| `src/tools/WebBrowserTool/WebBrowserTool.ts` | Tool implementation (missing) |
| `src/screens/REPL.tsx:273,4582` | Panel rendering |
| `src/tools.ts:115-116` | Tool registration |
