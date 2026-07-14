import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { ClaudeSpark } from './brand';
import { Sidebar, type ShellNav, type ShellView } from './Sidebar';
import type { Project, Session } from '../types';

// =============================================================================
// 应用外壳 — 左侧边栏 + 内容区；移动端侧边栏为抽屉
// =============================================================================

interface AppShellProps {
  product: 'chat' | 'code';
  view: ShellView;
  sessions: Session[];
  projects?: Project[];
  activeSessionId?: string | null;
  nav: ShellNav;
  onOpenIdentity: () => void;
  onOpenTokens: () => void;
  onRefresh?: () => void | Promise<void>;
  children: ReactNode;
}

export function AppShell({
  product,
  view,
  sessions,
  projects = [],
  activeSessionId,
  nav,
  onOpenIdentity,
  onOpenTokens,
  onRefresh,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('rcs-sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    try {
      localStorage.setItem('rcs-sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      // localStorage may be unavailable in hardened/private browsing contexts.
    }
  }, [collapsed]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0 text-text-primary">
      {/* 桌面侧边栏 */}
      <Sidebar
        className="hidden md:flex flex-shrink-0"
        product={product}
        view={view}
        sessions={sessions}
        projects={projects}
        activeSessionId={activeSessionId}
        nav={nav}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
        onOpenIdentity={onOpenIdentity}
        onOpenTokens={onOpenTokens}
        onRefresh={onRefresh}
      />

      {/* 移动端抽屉 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="关闭侧边栏"
            className="absolute inset-0 bg-black/40"
            onClick={closeMobile}
          />
          <div className="absolute inset-y-0 left-0 flex">
            <Sidebar
              product={product}
              view={view}
              sessions={sessions}
              projects={projects}
              activeSessionId={activeSessionId}
              nav={nav}
              collapsed={false}
              onToggleCollapse={closeMobile}
              onOpenIdentity={() => {
                closeMobile();
                onOpenIdentity();
              }}
              onOpenTokens={() => {
                closeMobile();
                onOpenTokens();
              }}
              onRefresh={onRefresh}
              onNavigated={closeMobile}
            />
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={closeMobile}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-1 text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 内容区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 移动端顶栏 */}
        <div className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-border bg-surface-1/80 px-3 backdrop-blur-md md:hidden">
          <button
            type="button"
            aria-label="打开侧边栏"
            onClick={() => setMobileOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-2"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className={cn('flex items-center gap-1.5 font-sans text-base font-semibold')}>
            <ClaudeSpark size={15} />
            {product === 'chat' ? 'Claude' : 'Claude Code'}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
