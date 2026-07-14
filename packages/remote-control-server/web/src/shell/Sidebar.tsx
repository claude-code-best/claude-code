import { useMemo } from 'react';
import {
  Plus,
  MessageSquare,
  FolderGit2,
  Search,
  Activity,
  PanelLeftClose,
  PanelLeft,
  ChevronsUpDown,
  SquareTerminal,
  KeyRound,
  QrCode,
  LayoutGrid,
  Sun,
  Moon,
  Monitor,
  Check,
  Inbox,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import { cn } from '../lib/utils';
import { useTheme, type Theme } from '../lib/theme';
import { getUuid } from '../api/client';
import { SessionListItem } from '../components/SessionListItem';
import { ClaudeSpark, EmptySessionsGlyph } from './brand';
import { sessionTimestamp } from './format';
import type { Project, Session } from '../types';

// =============================================================================
// 应用侧边栏 — 仿 claude.ai：Chat 与 Code 两种产品形态
// 只放已对接接口的入口：新对话/对话/项目/产品切换/最近会话/身份与 Token
// =============================================================================

export type ShellView =
  | 'chat-home'
  | 'chat-list'
  | 'chat-projects'
  | 'chat-session'
  | 'code-home'
  | 'code-projects'
  | 'code-project'
  | 'code-session'
  | 'runtime-center'
  | 'channels'
  | 'providers';

export interface ShellNav {
  goChatHome: () => void;
  goChats: () => void;
  goProjects: () => void;
  goProject: (projectId: string) => void;
  goChatSession: (sessionId: string) => void;
  goCodeHome: () => void;
  goCodeProjects: () => void;
  goCodeProject: (projectId: string) => void;
  goCodeSession: (sessionId: string) => void;
  goRuntimeCenter: (product: 'chat' | 'code') => void;
  goChannels: (product: 'chat' | 'code') => void;
  goProviders: (product: 'chat' | 'code') => void;
  goClassic: () => void;
}

interface SidebarProps {
  product: 'chat' | 'code';
  view: ShellView;
  sessions: Session[];
  projects?: Project[];
  activeSessionId?: string | null;
  nav: ShellNav;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenIdentity: () => void;
  onOpenTokens: () => void;
  onRefresh?: () => void | Promise<void>;
  /** 移动端抽屉模式下点击条目后关闭 */
  onNavigated?: () => void;
  className?: string;
}

export function Sidebar({
  product,
  view,
  sessions,
  projects = [],
  activeSessionId,
  nav,
  collapsed,
  onToggleCollapse,
  onOpenIdentity,
  onOpenTokens,
  onRefresh,
  onNavigated,
  className,
}: SidebarProps) {
  const go = (fn: () => void) => () => {
    fn();
    onNavigated?.();
  };

  const recents = useMemo(() => [...sessions].sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a)), [sessions]);

  return (
    <div
      className={cn(
        'app-sidebar flex h-full flex-col border-r border-border bg-surface-1 transition-all duration-200',
        collapsed ? 'w-[60px]' : 'w-[300px]',
        className,
      )}
    >
      {/* ── 品牌行 ── */}
      <div className={cn('flex items-center px-3.5 pt-4 pb-3', collapsed ? 'flex-col gap-2' : 'justify-between')}>
        <button
          type="button"
          onClick={go(product === 'chat' ? nav.goChatHome : nav.goCodeHome)}
          className="flex min-w-0 items-center gap-2.5"
          title={product === 'chat' ? 'Claude' : 'Claude Code'}
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10">
            <ClaudeSpark size={collapsed ? 20 : 17} />
          </span>
          {!collapsed && (
            <span className="truncate font-display text-[15px] font-semibold tracking-tight text-text-primary">
              {product === 'chat' ? 'Claude' : 'Claude Code'}
            </span>
          )}
        </button>
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'gap-0.5')}>
          {product === 'chat' && !collapsed && (
            <IconButton title="搜索对话" onClick={go(nav.goChats)}>
              <Search className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton title={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={onToggleCollapse}>
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>

      {/* ── 主导航 ── */}
      <nav className={cn('px-2.5 pt-2', collapsed && 'px-1.5')} aria-label="主导航">
        {!collapsed && (
          <div className="px-2 pb-1.5 font-display text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
            工作台
          </div>
        )}
        {product === 'chat' ? (
          <>
            <NavItem
              icon={<NewChatIcon />}
              label="新对话"
              collapsed={collapsed}
              active={view === 'chat-home'}
              onClick={go(nav.goChatHome)}
            />
            <NavItem
              icon={<MessageSquare className="h-4 w-4" />}
              label="对话"
              collapsed={collapsed}
              active={view === 'chat-list'}
              onClick={go(nav.goChats)}
            />
            <NavItem
              icon={<FolderGit2 className="h-4 w-4" />}
              label="项目"
              collapsed={collapsed}
              active={view === 'chat-projects'}
              onClick={go(nav.goProjects)}
            />
          </>
        ) : (
          <>
            <NavItem
              icon={<NewChatIcon />}
              label="新会话"
              collapsed={collapsed}
              active={view === 'code-home'}
              onClick={go(nav.goCodeHome)}
            />
            <NavItem
              icon={<FolderGit2 className="h-4 w-4" />}
              label="项目"
              collapsed={collapsed}
              active={view === 'code-projects' || view === 'code-project'}
              onClick={go(nav.goCodeProjects)}
            />
          </>
        )}
      </nav>

      <nav className={cn('px-2.5 pt-4', collapsed && 'px-1.5')} aria-label="运行与设置">
        {!collapsed && (
          <div className="px-2 pb-1.5 font-display text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
            系统
          </div>
        )}
        <NavItem
          icon={<Activity className="h-4 w-4" />}
          label="运行中心"
          collapsed={collapsed}
          active={view === 'runtime-center'}
          onClick={go(() => nav.goRuntimeCenter(product))}
        />
        <NavItem
          icon={<Inbox className="h-4 w-4" />}
          label="Channels"
          collapsed={collapsed}
          active={view === 'channels'}
          onClick={go(() => nav.goChannels(product))}
        />
        <NavItem
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label="模型供应商"
          collapsed={collapsed}
          active={view === 'providers'}
          onClick={go(() => nav.goProviders(product))}
        />
      </nav>

      {/* ── 产品切换 ── */}
      <div className={cn('px-2.5 pt-5', collapsed && 'px-1.5')}>
        {!collapsed && (
          <div className="px-2 pb-1.5 font-display text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
            切换产品
          </div>
        )}
        {product === 'chat' ? (
          <NavItem
            icon={<SquareTerminal className="h-4 w-4" />}
            label="Code"
            collapsed={collapsed}
            onClick={go(nav.goCodeHome)}
          />
        ) : (
          <NavItem
            icon={<MessageSquare className="h-4 w-4" />}
            label="Chat"
            collapsed={collapsed}
            onClick={go(nav.goChatHome)}
          />
        )}
      </div>

      {/* ── 最近会话 ── */}
      {!collapsed && (
        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="font-display text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
              {product === 'chat' ? '最近对话' : '会话'}
            </span>
            <span className="font-mono text-xs text-text-muted/70">{recents.length}</span>
          </div>
          {recents.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-8 text-center">
              <span className="text-sm text-text-muted font-display leading-relaxed">你启动的会话会显示在这里</span>
              <EmptySessionsGlyph className="opacity-70" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-2.5 pb-3">
              {(product === 'chat' ? recents.slice(0, 20) : recents).map(session => (
                <SessionListItem
                  key={session.id}
                  session={session}
                  product={product}
                  projects={projects}
                  compact
                  active={session.id === activeSessionId}
                  onOpen={sessionId => {
                    if (product === 'chat') nav.goChatSession(sessionId);
                    else nav.goCodeSession(sessionId);
                    onNavigated?.();
                  }}
                  onRefresh={onRefresh}
                />
              ))}
              {product === 'chat' && recents.length > 20 && (
                <button
                  type="button"
                  onClick={go(nav.goChats)}
                  className="w-full rounded-lg px-2.5 py-2 text-left font-display text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                >
                  查看全部 →
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      {/* ── 用户区 ── */}
      <UserFooter
        collapsed={collapsed}
        onOpenIdentity={onOpenIdentity}
        onOpenTokens={onOpenTokens}
        onGoClassic={go(nav.goClassic)}
      />
    </div>
  );
}

// =============================================================================
// 用户底栏 — 本机身份 + 设置菜单（身份二维码 / Token / 主题 / 经典控制台）
// =============================================================================

function UserFooter({
  collapsed,
  onOpenIdentity,
  onOpenTokens,
  onGoClassic,
}: {
  collapsed: boolean;
  onOpenIdentity: () => void;
  onOpenTokens: () => void;
  onGoClassic: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const uuid = getUuid();
  const shortId = uuid.slice(0, 8);

  const themeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: '浅色', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: '深色', icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: '跟随系统', icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <div className="border-t border-border bg-surface-0/40 p-2.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-surface-2',
              collapsed && 'justify-center px-0',
            )}
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-bg-inverted font-display text-xs font-semibold text-text-inverted shadow-sm">
              {shortId.slice(0, 1).toUpperCase()}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-display font-medium text-text-primary">
                    本机身份
                  </span>
                  <span className="block truncate font-mono text-[10px] text-text-muted">{shortId}</span>
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 rounded-xl border-border bg-surface-2">
          <DropdownMenuLabel className="font-mono text-[11px] text-text-muted">{uuid}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenIdentity}>
            <QrCode className="h-4 w-4" />
            <span className="ml-2 font-display">身份与配对</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenTokens}>
            <KeyRound className="h-4 w-4" />
            <span className="ml-2 font-display">API Token 管理</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-display text-text-muted">主题</DropdownMenuLabel>
          {themeOptions.map(opt => (
            <DropdownMenuItem key={opt.value} onClick={() => setTheme(opt.value)}>
              {opt.icon}
              <span className="ml-2 flex-1 font-display">{opt.label}</span>
              {theme === opt.value && <Check className="h-3.5 w-3.5 text-brand" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onGoClassic}>
            <LayoutGrid className="h-4 w-4" />
            <span className="ml-2 font-display">经典控制台</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// =============================================================================
// 基础元件
// =============================================================================

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
    >
      {children}
    </button>
  );
}

function NavItem({
  icon,
  label,
  collapsed,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'w-full flex items-center gap-2.5 rounded-lg py-2 font-display text-[14px] transition-colors',
        collapsed ? 'justify-center px-0' : 'px-2',
        active
          ? 'bg-brand/10 text-text-primary font-medium shadow-[inset_2px_0_0_var(--color-brand)]'
          : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center text-text-muted">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

/** claude.ai 的"新对话"加号 — 圆形描边小加号 */
function NewChatIcon() {
  return (
    <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full border border-current">
      <Plus className="h-3 w-3" />
    </span>
  );
}
