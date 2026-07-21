import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUp, ChevronRight, File, Folder, Loader2, RefreshCw, Server } from 'lucide-react';
import { apiListRemoteDirectory } from '../api/client';
import type { Environment } from '../types';
import {
  applyDirectoryError,
  applyListing,
  canConfirmWorkspace,
  createRemoteDirectoryState,
  enterDirectory,
  goBack,
  goToParent,
  refreshDirectory,
  requestPathInput,
  setPathInput,
} from '../lib/remote-directory-model';

interface RemoteDirectoryPickerProps {
  environment: Environment;
  value: string;
  onChange: (path: string) => void;
}

export function RemoteDirectoryPicker({ environment, value, onChange }: RemoteDirectoryPickerProps) {
  const initialPath = useMemo(() => value.trim() || environment.directory?.trim() || '/', [environment.id]);
  const [state, setState] = useState(() => createRemoteDirectoryState(initialPath));
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setState(createRemoteDirectoryState(initialPath));
  }, [environment.id, initialPath]);

  useEffect(() => {
    const controller = new AbortController();
    const requestedPath = state.requestedPath;
    void apiListRemoteDirectory(environment.id, requestedPath, controller.signal)
      .then(listing => {
        setState(current => (current.requestedPath === requestedPath ? applyListing(current, listing) : current));
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setState(current =>
          current.requestedPath === requestedPath
            ? applyDirectoryError(current, error instanceof Error ? error.message : '目录读取失败')
            : current,
        );
      });
    return () => controller.abort();
  }, [environment.id, state.requestedPath, refreshKey]);

  useEffect(() => {
    if (canConfirmWorkspace(state) && state.validatedInputPath) {
      onChange(state.validatedInputPath);
    }
  }, [onChange, state]);

  const reload = () => {
    setState(refreshDirectory(state));
    setRefreshKey(key => key + 1);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-1 shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Server className="h-4 w-4 text-brand" />
        <span className="min-w-0 flex-1 truncate font-display text-sm font-medium text-text-primary">
          {environment.device_name || environment.machine_name || environment.id}
        </span>
        <span className="font-display text-xs text-text-muted">远程目录</span>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border p-2">
        <PickerToolButton label="返回" disabled={state.backStack.length === 0} onClick={() => setState(goBack(state))}>
          <ArrowLeft />
        </PickerToolButton>
        <PickerToolButton label="上级目录" onClick={() => setState(goToParent(state))}>
          <ArrowUp />
        </PickerToolButton>
        <PickerToolButton label="刷新" disabled={state.loading} onClick={reload}>
          <RefreshCw className={state.loading ? 'animate-spin' : ''} />
        </PickerToolButton>
        <input
          aria-label="远程目录路径"
          value={state.pathInput}
          onChange={event => setState(setPathInput(state, event.target.value))}
          onKeyDown={event => {
            if (event.key === 'Enter') setState(requestPathInput(state));
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-brand/50"
        />
      </div>

      <div className="h-64 overflow-y-auto p-1.5" role="listbox" aria-label="远程目录内容">
        {state.loading ? (
          <div className="flex h-full items-center justify-center gap-2 font-display text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取目录…
          </div>
        ) : state.error ? (
          <div className="flex h-full items-center justify-center px-6 text-center font-display text-sm text-status-error">
            {state.error}
          </div>
        ) : state.entries.length === 0 ? (
          <div className="flex h-full items-center justify-center font-display text-sm text-text-muted">此目录为空</div>
        ) : (
          state.entries.map(entry =>
            entry.kind === 'directory' ? (
              <button
                key={entry.name}
                type="button"
                role="option"
                onClick={() => setState(enterDirectory(state, entry.name))}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
              >
                <Folder className="h-4 w-4 flex-shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate font-display text-sm text-text-primary">{entry.name}</span>
                <span className="font-display text-xs text-text-muted">文件夹</span>
                <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
              </button>
            ) : (
              <div
                key={entry.name}
                role="option"
                aria-disabled="true"
                className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-2.5 py-2 opacity-55"
              >
                <File className="h-4 w-4 flex-shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate font-display text-sm text-text-secondary">{entry.name}</span>
                <span className="font-display text-xs text-text-muted">文件 · 不可进入</span>
              </div>
            ),
          )
        )}
      </div>

      <div className="border-t border-border bg-surface-2/60 px-3 py-2 font-display text-xs text-text-muted">
        {canConfirmWorkspace(state) ? (
          <span>
            已选择固定工作区：<strong className="font-mono font-medium text-text-primary">{state.canonicalPath}</strong>
          </span>
        ) : (
          '只有成功读取的文件夹可以作为 Code 工作区'
        )}
      </div>
    </div>
  );
}

function PickerToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-primary disabled:opacity-30 [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      {children}
    </button>
  );
}
