import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import type { Project } from '../types';

const codeProject: Project = {
  id: 'project-code-1',
  product: 'code',
  name: 'Real-Agentic',
  project_prompt: 'Keep changes focused.',
  prompt_revision: 1,
  state: 'active',
  device_id: 'device-1',
  workspace_key: 'workspace-1',
  canonical_path: '/repo',
  git_root: '/repo/.git',
  git_repo_url: null,
  created_at: 1,
  updated_at: 2,
};

describe('ProjectDetailPage', () => {
  test('renders Code workspace identity and prompt editor', () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectDetailPage, {
        product: 'code',
        project: codeProject,
        projects: [codeProject],
        sessions: [],
        environments: [],
        onBack: () => {},
        onOpenSession: () => {},
        onRefresh: () => {},
      }),
    );
    expect(markup).toContain('/repo');
    expect(markup).toContain('项目提示词');
    expect(markup).toContain('Keep changes focused.');
  });

  test('keeps archived Code projects hidden from the default project list', () => {
    const archivedProject: Project = {
      ...codeProject,
      id: 'project-code-archived',
      name: 'Archived workspace should stay hidden',
      state: 'archived',
    };
    const markup = renderToStaticMarkup(
      createElement(ProjectsPage, {
        product: 'code',
        projects: [codeProject, archivedProject],
        sessions: [],
        environments: [],
        projectId: null,
        onOpenProject: () => {},
        onBackToList: () => {},
        onOpenSession: () => {},
        onRefresh: () => {},
      }),
    );
    expect(markup).toContain('Real-Agentic');
    expect(markup).not.toContain('Archived workspace should stay hidden');
  });

  test('does not offer blind restore for a missing Code workspace', () => {
    const missingProject: Project = {
      ...codeProject,
      id: 'project-code-missing',
      state: 'missing',
    };
    const markup = renderToStaticMarkup(
      createElement(ProjectDetailPage, {
        product: 'code',
        project: missingProject,
        projects: [missingProject],
        sessions: [],
        environments: [],
        onBack: () => {},
        onOpenSession: () => {},
        onRefresh: () => {},
      }),
    );
    expect(markup).not.toContain('恢复项目');
    expect(markup).toContain('重新从 Code 首页选择该文件夹');
  });
});
