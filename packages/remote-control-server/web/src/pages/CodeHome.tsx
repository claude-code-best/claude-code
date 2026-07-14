import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Check, ChevronDown, CornerDownLeft, FolderOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu';
import { cn } from '../lib/utils';
import { ClaudeSpark, ClawdPixel } from '../shell/brand';
import { EnvPicker, creatableEnvironments } from '../shell/EnvPicker';
import { createCodeSessionWithFirstMessage } from '../shell/createSession';
import { RemoteDirectoryPicker } from '../components/RemoteDirectoryPicker';
import type { Environment } from '../types';

// =============================================================================
// Code 首页 — 仿 Claude Code Web："What's up next?" + 底部输入
// 环境选择（repo）+ 权限模式，对接 POST /web/sessions 的
// environment_id / permission_mode 参数
// =============================================================================

const PERMISSION_MODES: { value: string; label: string; description: string }[] = [
  { value: 'default', label: '默认权限', description: '每次工具调用需确认' },
  { value: 'acceptEdits', label: '自动接受编辑', description: '文件编辑免确认' },
  { value: 'plan', label: '计划模式', description: '先出计划再执行' },
  { value: 'bypassPermissions', label: '跳过权限', description: '所有操作免确认' },
];

interface CodeHomeProps {
  environments: Environment[];
  onCreated: (sessionId: string) => void;
}

export function CodeHome({ environments, onCreated }: CodeHomeProps) {
  const [text, setText] = useState('');
  const [envId, setEnvId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState('default');
  const [directory, setDirectory] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const usable = useMemo(() => creatableEnvironments(environments), [environments]);
  const selectedEnv = useMemo(() => usable.find(env => env.id === envId), [usable, envId]);

  useEffect(() => {
    if (envId && !usable.some(env => env.id === envId)) {
      setEnvId(null);
      return;
    }
    if (!envId && usable.length === 1) {
      setEnvId(usable[0].id);
    }
  }, [usable, envId]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || creating) return;
    if (!envId) {
      setPickerOpen(true);
      return;
    }
    const requestedDirectory = directory.trim() || selectedEnv?.directory?.trim();
    if (!requestedDirectory) {
      setDirectoryOpen(true);
      setError('请选择或输入 Code 工作目录');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const session = await createCodeSessionWithFirstMessage({
        text: trimmed,
        environmentId: envId,
        permissionMode,
        directory: requestedDirectory,
      });
      onCreated(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建会话失败');
      setCreating(false);
    }
  }, [text, envId, permissionMode, directory, selectedEnv, creating, onCreated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  const canSend = text.trim().length > 0 && !creating;
  const currentMode = PERMISSION_MODES.find(m => m.value === permissionMode) || PERMISSION_MODES[0];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 居中标题 */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex items-center gap-2.5" style={{ animation: 'fadeUp 0.5s ease-out' }}>
          <ClaudeSpark size={22} />
          <div>
            <h1 className="font-display text-xl font-medium text-text-primary sm:text-2xl">What&rsquo;s up next?</h1>
            <p className="mt-1 text-center font-display text-sm text-text-muted">
              选择工作区后，会话会自动归入对应 Code 项目
            </p>
          </div>
        </div>
      </div>

      {/* 底部输入区 */}
      <div className="w-full max-w-3xl mx-auto px-4 pb-5 sm:px-8">
        {error && <p className="mb-2 text-center font-display text-xs text-status-error">{error}</p>}
        {usable.length === 0 && (
          <p className="mb-2 text-center font-display text-xs text-text-muted">
            暂无在线环境 — 在目标机器运行{' '}
            <code className="rounded bg-surface-1 px-1 py-0.5 font-mono">ccb remote-control</code> 接入
          </p>
        )}

        {/* 环境 chips 行 + Clawd 吉祥物 */}
        <div className="mb-1.5 flex items-end justify-between">
          <EnvPicker
            environments={environments}
            value={envId}
            onChange={nextEnvironmentId => {
              setEnvId(nextEnvironmentId);
              setDirectory('');
              setDirectoryOpen(false);
            }}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
          />
          <ClawdPixel className="mr-2 mb-0.5" />
        </div>

        {/* 输入卡片 */}
        <div
          className={cn(
            'rounded-xl border border-border bg-surface-2 overflow-hidden shadow-sm',
            'focus-within:border-brand/50 focus-within:shadow-[0_0_0_3px_rgba(217,119,87,0.12)] transition-all',
          )}
        >
          <div className="flex items-end gap-2 px-3 pt-3 pb-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="描述任务或提问"
              rows={1}
              disabled={creating}
              className="flex-1 resize-none border-none bg-transparent font-display text-sm text-text-primary placeholder:text-text-muted outline-none max-h-[200px] min-h-[24px] leading-normal"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              aria-label="发送"
              className={cn(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-all',
                canSend ? 'bg-brand text-white hover:bg-brand-light' : 'text-text-muted',
              )}
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
            </button>
          </div>

          {directoryOpen && selectedEnv && (
            <div className="border-t border-border p-2">
              <RemoteDirectoryPicker environment={selectedEnv} value={directory} onChange={setDirectory} />
            </div>
          )}

          {/* 底部工具行 — 权限模式 + 工作目录 */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-display text-xs text-text-secondary hover:bg-surface-1 hover:text-text-primary transition-colors"
                  >
                    {currentMode.label}
                    <ChevronDown className="h-3 w-3 text-text-muted" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-56 rounded-xl border-border bg-surface-2">
                  {PERMISSION_MODES.map(mode => (
                    <DropdownMenuItem key={mode.value} onClick={() => setPermissionMode(mode.value)}>
                      <span className="flex-1">
                        <span className="block font-display text-[13px]">{mode.label}</span>
                        <span className="block text-[11px] text-text-muted">{mode.description}</span>
                      </span>
                      {permissionMode === mode.value && <Check className="h-3.5 w-3.5 text-brand" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={() => setDirectoryOpen(open => !open)}
                title={directory ? `工作目录：${directory}` : '浏览远程工作目录'}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-display text-xs transition-colors',
                  directory || directoryOpen
                    ? 'text-brand bg-brand/[0.08]'
                    : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary',
                )}
              >
                <FolderOpen className="h-3 w-3" />
                {directory ? (
                  <span className="max-w-[180px] truncate font-mono">{directory}</span>
                ) : selectedEnv?.directory ? (
                  <span className="max-w-[180px] truncate font-mono">{selectedEnv.directory}</span>
                ) : (
                  '选择目录'
                )}
              </button>
            </div>
            <span className="font-display text-[11px] text-text-muted">Enter 发送</span>
          </div>
        </div>
      </div>
    </div>
  );
}
