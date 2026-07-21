import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { IdentityPanel } from './components/IdentityPanel';
import { TokenManagerDialog } from './components/TokenManagerDialog';
import { ThemeProvider } from './lib/theme';
import { getUuid, setUuid, apiBind, setActiveApiToken, detectServerMode } from './api/client';
import { ACPDirectView } from './components/ACPDirectView';
import { useTokens } from './hooks/useTokens';
import { useWorkspaceData } from './hooks/useWorkspaceData';
import { AppShell } from './shell/AppShell';
import { stashNewSessionWorkspace } from './shell/createSession';
import type { ShellNav, ShellView } from './shell/Sidebar';
import { ChatHome } from './pages/ChatHome';
import { ChatsPage } from './pages/ChatsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { CodeHome } from './pages/CodeHome';
import { RuntimeCenterPage } from './pages/RuntimeCenterPage';
import { ChannelsInboxPage } from './pages/ChannelsInboxPage';
import { ProviderSettingsPage } from './pages/ProviderSettingsPage';

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const SessionDetail = lazy(() => import('./pages/SessionDetail').then(m => ({ default: m.SessionDetail })));

// =============================================================================
// 路由 — /code/ 下的双产品结构：
//   /code/            Code 首页（仿 Claude Code Web）
//   /code/<sid>       Code 会话详情
//   /code/chat        Chat 首页（仿 claude.ai）；hash 子视图：
//                     #chats / #projects / #project=<envId> / #s=<sid>
//   /code/classic     经典控制台（原 Dashboard）
// =============================================================================

type ChatSub =
  | { kind: 'home' }
  | { kind: 'chats' }
  | { kind: 'projects' }
  | { kind: 'project'; projectId: string }
  | { kind: 'session'; sessionId: string };

type Route =
  | { view: 'code-home' }
  | { view: 'code-projects'; projectId: string | null }
  | { view: 'code-session'; sessionId: string }
  | { view: 'chat'; sub: ChatSub }
  | { view: 'runtime-center'; product: 'chat' | 'code' }
  | { view: 'channels'; product: 'chat' | 'code' }
  | { view: 'providers'; product: 'chat' | 'code' }
  | { view: 'classic' };

function parseChatHash(hash: string): ChatSub {
  const raw = hash.replace(/^#/, '');
  if (raw === 'chats') return { kind: 'chats' };
  if (raw === 'projects') return { kind: 'projects' };
  const project = raw.match(/^project=(.+)$/);
  if (project) return { kind: 'project', projectId: decodeURIComponent(project[1]) };
  const session = raw.match(/^s=(.+)$/);
  if (session) return { kind: 'session', sessionId: decodeURIComponent(session[1]) };
  return { kind: 'home' };
}

function parseProjectHash(hash: string): string | null {
  const match = hash.replace(/^#/, '').match(/^project=(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function parsePath(pathname: string, hash: string): Route {
  const match = pathname.match(/^\/code\/?([^/]*)/);
  const seg = match?.[1] || '';
  if (seg === '') return { view: 'code-home' };
  if (seg === 'projects') return { view: 'code-projects', projectId: parseProjectHash(hash) };
  if (seg === 'chat') return { view: 'chat', sub: parseChatHash(hash) };
  const globalProduct = hash.replace(/^#/, '') === 'chat' ? 'chat' : 'code';
  if (seg === 'runtime') return { view: 'runtime-center', product: globalProduct };
  if (seg === 'channels') return { view: 'channels', product: globalProduct };
  if (seg === 'providers') return { view: 'providers', product: globalProduct };
  if (seg === 'classic') return { view: 'classic' };
  return { view: 'code-session', sessionId: seg };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname, window.location.hash));
  const [identityOpen, setIdentityOpen] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [acpDirect, setAcpDirect] = useState<{ url: string; token: string } | null>(null);
  const { tokens, activeTokenId, activeLabel, activeTokenValue, setActiveTokenId, addToken, removeToken, updateToken } =
    useTokens();
  const workspace = useWorkspaceData();
  const chatSessions = useMemo(
    () => workspace.chat.sessions.filter(session => session.status !== 'archived'),
    [workspace.chat.sessions],
  );
  const allOpenCodeSessions = useMemo(
    () => workspace.code.sessions.filter(session => session.status !== 'archived'),
    [workspace.code.sessions],
  );
  // 已归档会话单独成组 — 侧边栏折叠展示，右键/⋯ 菜单可恢复
  const archivedChatSessions = useMemo(
    () => workspace.chat.sessions.filter(session => session.status === 'archived'),
    [workspace.chat.sessions],
  );
  const archivedCodeSessions = useMemo(
    () => workspace.code.sessions.filter(session => session.status === 'archived'),
    [workspace.code.sessions],
  );
  const codeSessions = useMemo(() => {
    const activeProjectIds = new Set(
      workspace.code.projects.filter(project => project.state === 'active').map(project => project.id),
    );
    return allOpenCodeSessions.filter(session => !session.project_id || activeProjectIds.has(session.project_id));
  }, [allOpenCodeSessions, workspace.code.projects]);

  // Sync active token to API client
  useEffect(() => {
    setActiveApiToken(activeTokenValue);
  }, [activeTokenValue]);

  // 服务端单用户模式探测 — 命中后统一固定 UUID 并刷新列表，
  // 避免首屏用浏览器随机 UUID 拿到的结果停留（10s 轮询也会兜底纠正）
  useEffect(() => {
    let cancelled = false;
    void detectServerMode().then(singleUser => {
      if (!cancelled && singleUser) void workspace.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [workspace.refresh]);

  const handleSetActiveToken = useCallback(
    (id: string) => {
      setActiveTokenId(id);
    },
    [setActiveTokenId],
  );

  const navigate = useCallback((path: string, hash = '') => {
    window.history.pushState(null, '', `${path}${hash}`);
    setRoute(parsePath(path, hash));
  }, []);

  // 解析 URL：query 参数处理（QR 导入 / ACP 直连 / CLI 会话绑定）+ 路由
  const parseRoute = useCallback(() => {
    getUuid();

    const params = new URLSearchParams(window.location.search);
    const importUuid = params.get('uuid');
    if (importUuid) {
      setUuid(importUuid);
      const url = new URL(window.location.href);
      url.searchParams.delete('uuid');
      window.history.replaceState(null, '', url);
    }

    // ACP 直连 (?acp=1)
    const acpParam = params.get('acp');
    if (acpParam === '1') {
      const stored = sessionStorage.getItem('acp_connection');
      if (stored) {
        try {
          const acpData = JSON.parse(stored);
          if (acpData.url && acpData.token) {
            setAcpDirect({ url: acpData.url, token: acpData.token });
            sessionStorage.removeItem('acp_connection');
            const url = new URL(window.location.href);
            url.searchParams.delete('acp');
            window.history.replaceState(null, '', url);
            return;
          }
        } catch {
          sessionStorage.removeItem('acp_connection');
        }
      }
    }

    // CLI 会话绑定 (?sid=xxx)
    const sid = params.get('sid');
    if (sid) {
      const url = new URL(window.location.href);
      url.searchParams.delete('sid');
      window.history.replaceState(null, '', `/code/${sid}`);
      setRoute({ view: 'code-session', sessionId: sid });
      apiBind(sid).catch((err: unknown) => {
        console.warn('Failed to bind session:', err);
      });
      return;
    }

    setRoute(parsePath(window.location.pathname, window.location.hash));
  }, []);

  useEffect(() => {
    parseRoute();
    window.addEventListener('popstate', parseRoute);
    window.addEventListener('hashchange', parseRoute);
    return () => {
      window.removeEventListener('popstate', parseRoute);
      window.removeEventListener('hashchange', parseRoute);
    };
  }, [parseRoute]);

  // 导航集合 — 传给侧边栏与页面
  const nav: ShellNav = useMemo(
    () => ({
      goChatHome: () => navigate('/code/chat'),
      goChats: () => navigate('/code/chat', '#chats'),
      goProjects: () => navigate('/code/chat', '#projects'),
      goProject: (projectId: string) => navigate('/code/chat', `#project=${encodeURIComponent(projectId)}`),
      goChatSession: (sessionId: string) => navigate('/code/chat', `#s=${encodeURIComponent(sessionId)}`),
      goCodeHome: () => navigate('/code/'),
      // 「新会话」入口：若当前正处于某个 Code 会话中，默认带入该会话所属项目的
      // 环境 + 目录（即项目的工作目录），再进入 Code 首页。
      newCodeConversation: () => {
        if (route.view === 'code-session') {
          const active = allOpenCodeSessions.find(session => session.id === route.sessionId);
          if (active) {
            stashNewSessionWorkspace({
              environmentId: active.runtime_environment_id ?? active.environment_id ?? null,
              directory: active.directory ?? null,
            });
          }
        }
        navigate('/code/');
      },
      // 在某个项目下新建会话：默认带入该项目的环境 + 规范化工作目录。
      newCodeConversationInProject: context => {
        stashNewSessionWorkspace(context);
        navigate('/code/');
      },
      goCodeProjects: () => navigate('/code/projects'),
      goCodeProject: (projectId: string) => navigate('/code/projects', `#project=${encodeURIComponent(projectId)}`),
      goCodeSession: (sessionId: string) => navigate(`/code/${sessionId}`),
      goRuntimeCenter: product => navigate('/code/runtime', product === 'chat' ? '#chat' : ''),
      goChannels: product => navigate('/code/channels', product === 'chat' ? '#chat' : ''),
      goProviders: product => navigate('/code/providers', product === 'chat' ? '#chat' : ''),
      goClassic: () => navigate('/code/classic'),
    }),
    [navigate, route, allOpenCodeSessions],
  );

  const handleChatSessionCreated = useCallback(
    (sessionId: string) => {
      workspace.refresh();
      nav.goChatSession(sessionId);
    },
    [workspace, nav],
  );

  const handleCodeSessionCreated = useCallback(
    (sessionId: string) => {
      workspace.refresh();
      nav.goCodeSession(sessionId);
    },
    [workspace, nav],
  );

  const handleChatSessionDeleted = useCallback(async () => {
    await workspace.refresh();
    nav.goChatHome();
  }, [workspace.refresh, nav]);

  const handleCodeSessionDeleted = useCallback(async () => {
    await workspace.refresh();
    nav.goCodeHome();
  }, [workspace.refresh, nav]);

  // ── ACP 直连视图（保持原全屏形态） ──
  if (acpDirect) {
    return (
      <ThemeProvider defaultTheme="system">
        <div className="flex h-screen flex-col bg-surface-0 text-text-primary">
          <Navbar
            onIdentityClick={() => setIdentityOpen(true)}
            onTokenClick={() => setTokenDialogOpen(true)}
            sessionTitle="ACP"
            onBack={() => {
              setAcpDirect(null);
              navigate('/code/');
            }}
          />
          <ACPDirectView
            url={acpDirect.url}
            token={acpDirect.token}
            onBack={() => {
              setAcpDirect(null);
              navigate('/code/');
            }}
          />
          <GlobalDialogs
            identityOpen={identityOpen}
            setIdentityOpen={setIdentityOpen}
            tokenDialogOpen={tokenDialogOpen}
            setTokenDialogOpen={setTokenDialogOpen}
            tokens={tokens}
            activeTokenId={activeTokenId}
            onSetActive={handleSetActiveToken}
            addToken={addToken}
            removeToken={removeToken}
            updateToken={updateToken}
          />
        </div>
      </ThemeProvider>
    );
  }

  // ── 经典控制台（原 Dashboard + Navbar） ──
  if (route.view === 'classic') {
    return (
      <ThemeProvider defaultTheme="system">
        <div className="flex h-screen flex-col bg-surface-0 text-text-primary">
          <Navbar
            onIdentityClick={() => setIdentityOpen(true)}
            onTokenClick={() => setTokenDialogOpen(true)}
            activeTokenLabel={activeLabel}
            sessionTitle="经典控制台"
            onBack={() => navigate('/code/')}
          />
          <Suspense fallback={<CenteredLoading />}>
            <div className="flex-1 overflow-y-auto">
              <Dashboard onNavigateSession={id => nav.goCodeSession(id)} />
            </div>
          </Suspense>
          <GlobalDialogs
            identityOpen={identityOpen}
            setIdentityOpen={setIdentityOpen}
            tokenDialogOpen={tokenDialogOpen}
            setTokenDialogOpen={setTokenDialogOpen}
            tokens={tokens}
            activeTokenId={activeTokenId}
            onSetActive={handleSetActiveToken}
            addToken={addToken}
            removeToken={removeToken}
            updateToken={updateToken}
          />
        </div>
      </ThemeProvider>
    );
  }

  // ── 新外壳：Chat / Code 双产品 ──
  const product: 'chat' | 'code' =
    route.view === 'chat'
      ? 'chat'
      : route.view === 'runtime-center' || route.view === 'channels' || route.view === 'providers'
        ? route.product
        : 'code';
  const productSessions = product === 'chat' ? chatSessions : codeSessions;
  const openProductSession = product === 'chat' ? nav.goChatSession : nav.goCodeSession;

  let shellView: ShellView;
  let activeSessionId: string | null = null;
  let content: React.ReactNode;

  if (route.view === 'runtime-center') {
    shellView = 'runtime-center';
    content = (
      <RuntimeCenterPage
        sessions={productSessions}
        environments={workspace.environments}
        onOpenSession={openProductSession}
      />
    );
  } else if (route.view === 'channels') {
    shellView = 'channels';
    content = <ChannelsInboxPage sessions={productSessions} onOpenSession={openProductSession} />;
  } else if (route.view === 'providers') {
    shellView = 'providers';
    content = <ProviderSettingsPage environments={workspace.environments} onRefresh={workspace.refresh} />;
  } else if (route.view === 'chat') {
    const sub = route.sub;
    if (sub.kind === 'home') {
      shellView = 'chat-home';
      content = (
        <ChatHome
          environments={workspace.environments}
          projects={workspace.chat.projects}
          onCreated={handleChatSessionCreated}
          onProjectsChanged={workspace.refresh}
        />
      );
    } else if (sub.kind === 'chats') {
      shellView = 'chat-list';
      content = (
        <ChatsPage
          sessions={workspace.chat.sessions}
          environments={workspace.environments}
          projects={workspace.chat.projects}
          onOpen={id => nav.goChatSession(id)}
          onNew={() => nav.goChatHome()}
          onRefresh={workspace.refresh}
        />
      );
    } else if (sub.kind === 'projects' || sub.kind === 'project') {
      shellView = 'chat-projects';
      content = (
        <ProjectsPage
          product="chat"
          projects={workspace.chat.projects}
          sessions={chatSessions}
          environments={workspace.environments}
          projectId={sub.kind === 'project' ? sub.projectId : null}
          onOpenProject={id => nav.goProject(id)}
          onBackToList={() => nav.goProjects()}
          onOpenSession={id => nav.goChatSession(id)}
          onRefresh={workspace.refresh}
          onNewProject={() => nav.goChatHome()}
        />
      );
    } else {
      shellView = 'chat-session';
      activeSessionId = sub.sessionId;
      content = (
        <Suspense fallback={<CenteredLoading />}>
          <SessionDetail
            key={sub.sessionId}
            sessionId={sub.sessionId}
            expectedProduct="chat"
            environments={workspace.environments}
            onBack={() => nav.goChatHome()}
            onChanged={workspace.refresh}
            onDeleted={handleChatSessionDeleted}
          />
        </Suspense>
      );
    }
  } else if (route.view === 'code-projects') {
    shellView = route.projectId ? 'code-project' : 'code-projects';
    content = (
      <ProjectsPage
        product="code"
        projects={workspace.code.projects}
        sessions={allOpenCodeSessions}
        environments={workspace.environments}
        projectId={route.projectId}
        onOpenProject={id => nav.goCodeProject(id)}
        onBackToList={() => nav.goCodeProjects()}
        onOpenSession={id => nav.goCodeSession(id)}
        onRefresh={workspace.refresh}
        onNewProject={() => nav.goCodeHome()}
        onNewConversation={context => nav.newCodeConversationInProject(context)}
      />
    );
  } else if (route.view === 'code-session') {
    shellView = 'code-session';
    activeSessionId = route.sessionId;
    content = (
      <Suspense fallback={<CenteredLoading />}>
        <SessionDetail
          key={route.sessionId}
          sessionId={route.sessionId}
          expectedProduct="code"
          environments={workspace.environments}
          onBack={() => nav.goCodeHome()}
          onChanged={workspace.refresh}
          onDeleted={handleCodeSessionDeleted}
        />
      </Suspense>
    );
  } else {
    shellView = 'code-home';
    content = <CodeHome environments={workspace.environments} onCreated={handleCodeSessionCreated} />;
  }

  return (
    <ThemeProvider defaultTheme="system">
      <AppShell
        product={product}
        view={shellView}
        sessions={product === 'chat' ? chatSessions : codeSessions}
        archivedSessions={product === 'chat' ? archivedChatSessions : archivedCodeSessions}
        projects={product === 'chat' ? workspace.chat.projects : workspace.code.projects}
        activeSessionId={activeSessionId}
        nav={nav}
        onOpenIdentity={() => setIdentityOpen(true)}
        onOpenTokens={() => setTokenDialogOpen(true)}
        onRefresh={workspace.refresh}
      >
        {content}
      </AppShell>
      <GlobalDialogs
        identityOpen={identityOpen}
        setIdentityOpen={setIdentityOpen}
        tokenDialogOpen={tokenDialogOpen}
        setTokenDialogOpen={setTokenDialogOpen}
        tokens={tokens}
        activeTokenId={activeTokenId}
        onSetActive={handleSetActiveToken}
        addToken={addToken}
        removeToken={removeToken}
        updateToken={updateToken}
      />
    </ThemeProvider>
  );
}

// =============================================================================
// 复用件
// =============================================================================

function CenteredLoading() {
  return <div className="flex flex-1 items-center justify-center text-text-muted">加载中…</div>;
}

function GlobalDialogs(props: {
  identityOpen: boolean;
  setIdentityOpen: (open: boolean) => void;
  tokenDialogOpen: boolean;
  setTokenDialogOpen: (open: boolean) => void;
  tokens: ReturnType<typeof useTokens>['tokens'];
  activeTokenId: ReturnType<typeof useTokens>['activeTokenId'];
  onSetActive: (id: string) => void;
  addToken: ReturnType<typeof useTokens>['addToken'];
  removeToken: ReturnType<typeof useTokens>['removeToken'];
  updateToken: ReturnType<typeof useTokens>['updateToken'];
}) {
  return (
    <>
      <IdentityPanel open={props.identityOpen} onClose={() => props.setIdentityOpen(false)} />
      <TokenManagerDialog
        open={props.tokenDialogOpen}
        onClose={() => props.setTokenDialogOpen(false)}
        tokens={props.tokens}
        activeTokenId={props.activeTokenId}
        onSetActive={props.onSetActive}
        onAdd={props.addToken}
        onRemove={props.removeToken}
        onUpdate={props.updateToken}
      />
    </>
  );
}
