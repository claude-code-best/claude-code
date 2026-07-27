import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clampContextMenuPosition, SessionContextMenu } from '../components/SessionContextMenu';
import { canRebindProductSession } from '../components/SessionActions';
import { SessionListItem } from '../components/SessionListItem';
import { SessionControlBar } from '../components/SessionControlBar';
import type { ProviderModelCatalog, Session } from '../types';

const staleCatalog: ProviderModelCatalog = {
  version: 1,
  revision: 3,
  defaultModel: { providerId: 'provider-1', modelProfileId: 'model-1' },
  providers: [
    {
      id: 'provider-1',
      displayName: 'Provider 1',
      kind: 'openai-compatible',
      auth: { scheme: 'api-key', source: 'settings', configured: true },
      enabled: true,
      archived: false,
      models: [
        {
          id: 'model-1',
          displayName: 'Model 1',
          remoteModelId: 'model-1-remote',
          enabled: true,
          archived: false,
          validation: { status: 'valid' },
        },
      ],
    },
  ],
  features: {
    catalogWrite: false,
    sessionPersistence: true,
    runtimeSwitch: true,
    secretControl: false,
  },
};

const session: Session = {
  id: 'session-1',
  title: '检查项目',
  status: 'idle',
  product: 'chat',
  project_id: 'project-1',
  created_at: 1,
  updated_at: 2,
};

describe('session actions UI', () => {
  test('renders an accessible more action and context menu surface', () => {
    const row = renderToStaticMarkup(
      createElement(SessionListItem, {
        session,
        product: 'chat',
        onOpen: () => {},
        onRefresh: () => {},
      }),
    );
    const menu = renderToStaticMarkup(
      createElement(SessionContextMenu, {
        session,
        product: 'chat',
        open: true,
        x: 24,
        y: 36,
        onClose: () => {},
        onChanged: () => {},
      }),
    );
    expect(row).toContain('管理对话');
    expect(menu).toContain('归档对话');
    expect(menu).toContain('永久删除');
  });

  test('clamps menus to the viewport and keeps product sessions immutable', () => {
    expect(clampContextMenuPosition(980, 760, 208, 280, 1024, 768)).toEqual({ left: 808, top: 480 });
    expect(canRebindProductSession({ product: 'chat', project_id: null })).toBe(false);
    expect(canRebindProductSession({ product: 'code', project_id: 'project-1' })).toBe(false);
    expect(canRebindProductSession({ product: 'code', project_id: null })).toBe(true);
  });

  test('keeps a stale cached model catalog selectable for runtime validation', () => {
    const markup = renderToStaticMarkup(
      createElement(SessionControlBar, {
        sessionInfo: null,
        usage: null,
        providerCatalog: staleCatalog,
        catalogStale: true,
        onSetPermissionMode: async () => ({ ok: true as const }),
        onSetModel: async () => ({ ok: true as const }),
        onSetProviderModel: async () => ({ ok: true as const }),
        onSetThinking: async () => ({ ok: true as const }),
      }),
    );
    expect(markup).toContain('当前为缓存模型目录，切换时由 Worker 校验最新配置');
    expect(markup).not.toContain('disabled=');
  });
});
