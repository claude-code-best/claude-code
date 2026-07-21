import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clampContextMenuPosition, SessionContextMenu } from '../components/SessionContextMenu';
import { canRebindProductSession } from '../components/SessionActions';
import { SessionListItem } from '../components/SessionListItem';
import type { Session } from '../types';

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
});
