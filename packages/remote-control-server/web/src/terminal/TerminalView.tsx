import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { SessionTerminalsApi } from './useSessionTerminals';
import { useTheme } from '../lib/theme';
import { createTerminalResizeScheduler } from './resizeScheduler';

// =============================================================================
// 单个终端的 xterm 实例 — 深色终端配色，输入回传，随容器 fit。
// 即使应用是浅色主题，终端也保持深色，避免白底黑字和网页内容混成一片。
// =============================================================================

// macOS Terminal.app 默认（Basic）ANSI 16 色
const APPLE_ANSI = {
  black: '#000000',
  red: '#c33720',
  green: '#26a439',
  yellow: '#cdac08',
  blue: '#0d68a8',
  magenta: '#9a5fb5',
  cyan: '#00a2b8',
  white: '#c7c7c7',
  brightBlack: '#676767',
  brightRed: '#e05a49',
  brightGreen: '#4dd763',
  brightYellow: '#e6dc44',
  brightBlue: '#4e91d9',
  brightMagenta: '#c191d6',
  brightCyan: '#4dd6e8',
  brightWhite: '#ffffff',
};

const DARK_THEME = {
  background: '#1e1e1e',
  foreground: '#e8e6e3',
  cursor: '#d77757',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#3a3835',
  ...APPLE_ANSI,
};

const LIGHT_THEME = {
  background: '#242220',
  foreground: '#f1eee8',
  cursor: '#d77757',
  cursorAccent: '#242220',
  selectionBackground: '#4a4540',
  ...APPLE_ANSI,
  white: '#d8d2ca',
  brightWhite: '#ffffff',
};

interface TerminalViewProps {
  termId: string;
  api: SessionTerminalsApi;
  /** 当前是否为激活 tab（非激活时不 fit，避免 0 尺寸） */
  active: boolean;
}

export function TerminalView({ termId, api, active }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const resizeSchedulerRef = useRef<ReturnType<typeof createTerminalResizeScheduler> | null>(null);
  const wasConnectedRef = useRef(api.connected);
  const { resolvedTheme } = useTheme();
  // 用 ref 持有最新 api，避免因 api 变化重建终端
  const apiRef = useRef(api);
  apiRef.current = api;

  // 创建 xterm 实例（每个 termId 一次）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Monaco, monospace',
      fontSize: 12.5,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      theme: resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME,
      allowProposedApi: true,
      disableStdin: !apiRef.current.connected,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    // 用户键入 → 回传后端
    const dataDisposable = term.onData(data => {
      if (!apiRef.current.connected) return;
      apiRef.current.sendInput(termId, data);
    });

    const resizeScheduler = createTerminalResizeScheduler(({ cols, rows }) => {
      apiRef.current.sendResize(termId, cols, rows);
    });
    resizeSchedulerRef.current = resizeScheduler;

    // 尺寸变化 → 上报后端 PTY resize（必须在 fit 之前注册，否则首次 fit 丢失）。
    // 守卫过小尺寸：布局未就绪时 fit 会量到极小值，别把 PTY 改成 11×4。
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (cols < 20 || rows < 4) return;
      resizeScheduler.schedule({ cols, rows });
    });

    // 首次 fit 延到下一帧，等绝对定位容器完成布局再量尺寸
    requestAnimationFrame(() => {
      if (termRef.current !== term) return;
      try {
        fit.fit();
      } catch {
        // container 尺寸未就绪，ResizeObserver 会补
      }
    });

    // 订阅输出流（立即回放缓冲）
    const unsubscribe = apiRef.current.subscribe(termId, {
      onData: data => term.write(data),
      onReset: () => term.reset(),
    });

    return () => {
      unsubscribe();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeScheduler.dispose();
      if (resizeSchedulerRef.current === resizeScheduler) {
        resizeSchedulerRef.current = null;
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // 只依赖 termId：api 通过 ref 读取，主题变化单独处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  // 主题切换 → 更新配色
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME;
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.disableStdin = !api.connected;
    }
    const becameConnected = api.connected && !wasConnectedRef.current;
    wasConnectedRef.current = api.connected;
    if (!becameConnected) return;

    // The PTY may have retained dimensions from before the disconnect. Clear
    // the scheduler's equality cache so the current size is sent once even if
    // xterm's cols/rows did not numerically change.
    resizeSchedulerRef.current?.reset();
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      if (term.cols >= 20 && term.rows >= 4) {
        resizeSchedulerRef.current?.schedule({
          cols: term.cols,
          rows: term.rows,
        });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [api.connected, active]);

  // 激活 / 容器尺寸变化 → refit
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const fit = fitRef.current;
    if (!container || !fit) return;

    const doFit = () => {
      // 容器尚无实际尺寸时跳过，避免 fit 量到极小值
      if (container.clientWidth < 40 || container.clientHeight < 20) return;
      try {
        fit.fit();
        const term = termRef.current;
        if (apiRef.current.connected && term && term.cols >= 20 && term.rows >= 4) {
          resizeSchedulerRef.current?.schedule({ cols: term.cols, rows: term.rows });
        }
      } catch {
        // ignore
      }
    };
    const raf = requestAnimationFrame(doFit);
    const ro = new ResizeObserver(doFit);
    ro.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active]);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ display: active ? 'block' : 'none' }}>
      <div ref={containerRef} className="h-full w-full px-2 py-1.5" />
      {!api.connected && (
        <div className="pointer-events-none absolute inset-x-3 top-3 rounded-md border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/75 backdrop-blur-sm">
          终端正在重连，输入未发送
        </div>
      )}
    </div>
  );
}
