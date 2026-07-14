import { useMemo, useState } from 'react';
import { FolderGit2, GitBranch, MessageSquare } from 'lucide-react';
import { ProjectDetailPage } from './ProjectDetailPage';
import type { Environment, Product, Project, Session } from '../types';
import { cn } from '../lib/utils';

interface ProjectsPageProps {
  product: Product;
  projects: Project[];
  sessions: Session[];
  environments: Environment[];
  projectId: string | null;
  onOpenProject: (projectId: string) => void;
  onBackToList: () => void;
  onOpenSession: (sessionId: string) => void;
  onRefresh: () => void | Promise<void>;
}

export function ProjectsPage({
  product,
  projects,
  sessions,
  environments,
  projectId,
  onOpenProject,
  onBackToList,
  onOpenSession,
  onRefresh,
}: ProjectsPageProps) {
  const [scope, setScope] = useState<'active' | 'archived'>('active');
  const project = projectId ? projects.find(item => item.id === projectId) : undefined;
  const projectSessions = useMemo(
    () => (projectId ? sessions.filter(session => session.project_id === projectId) : []),
    [projectId, sessions],
  );
  const visibleProjects = useMemo(
    () =>
      product === 'chat'
        ? projects
        : projects.filter(projectItem =>
            scope === 'active' ? projectItem.state === 'active' : projectItem.state !== 'active',
          ),
    [product, projects, scope],
  );

  if (projectId && project) {
    return (
      <ProjectDetailPage
        product={product}
        project={project}
        projects={projects}
        sessions={projectSessions}
        environments={environments}
        onBack={onBackToList}
        onOpenSession={onOpenSession}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="font-sans text-2xl font-medium text-text-primary sm:text-3xl">
              {product === 'chat' ? 'Chat 项目' : 'Code 项目'}
            </h1>
            <p className="mt-1 font-display text-sm text-text-muted">
              {product === 'chat'
                ? '把相关对话和项目提示词放在一起管理。Chat 项目不绑定工作区。'
                : '每个设备与规范化工作区会自动归入一个 Code 项目。'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {product === 'code' && (
              <div className="flex rounded-lg border border-border bg-surface-1 p-0.5" aria-label="Code 项目范围">
                <button
                  type="button"
                  onClick={() => setScope('active')}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-display text-xs transition-colors',
                    scope === 'active' ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  活动
                </button>
                <button
                  type="button"
                  onClick={() => setScope('archived')}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-display text-xs transition-colors',
                    scope === 'archived' ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  已归档
                </button>
              </div>
            )}
            <span className="rounded-full bg-surface-2 px-3 py-1 font-display text-sm text-text-muted">
              {visibleProjects.length} 个项目
            </span>
          </div>
        </div>

        {visibleProjects.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface-1 px-6 py-14 text-center">
            <FolderGit2 className="mx-auto mb-3 h-6 w-6 text-text-muted" />
            <p className="font-display text-sm text-text-secondary">
              {product === 'chat' ? '还没有 Chat 项目' : scope === 'active' ? '还没有活动 Code 项目' : '没有已归档项目'}
            </p>
            {(product === 'chat' || scope === 'active') && (
              <p className="mt-2 font-display text-sm text-text-muted">
                {product === 'chat' ? '在新对话右上角创建或选择项目。' : '从 Code 首页选择工作区并创建第一个会话。'}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-2">
            {visibleProjects.map(projectItem => {
              const count = sessions.filter(session => session.project_id === projectItem.id).length;
              return (
                <button
                  key={projectItem.id}
                  type="button"
                  onClick={() => onOpenProject(projectItem.id)}
                  className="group rounded-2xl border border-border bg-surface-1 p-4 text-left transition-all hover:border-brand/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderGit2 className="h-5 w-5 flex-shrink-0 text-brand" />
                      <span className="truncate font-display text-base font-semibold text-text-primary">
                        {projectItem.name}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-display text-xs',
                        projectItem.state === 'active' ? 'bg-brand/10 text-brand' : 'bg-surface-2 text-text-muted',
                      )}
                    >
                      {projectItem.state === 'active' ? '活动' : projectItem.state === 'missing' ? '缺失' : '已归档'}
                    </span>
                  </div>
                  {productItemPath(projectItem) && (
                    <p
                      className="mt-3 truncate font-mono text-xs text-text-muted"
                      title={productItemPath(projectItem) || undefined}
                    >
                      {productItemPath(projectItem)}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-4 font-display text-sm text-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4" />
                      {count} 个会话
                    </span>
                    {projectItem.git_root && (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <GitBranch className="h-4 w-4" />
                        <span className="truncate">Git</span>
                      </span>
                    )}
                    <span className="ml-auto text-xs text-text-muted">提示词 v{projectItem.prompt_revision}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function productItemPath(project: Project): string | null {
  if (project.product === 'code') return project.canonical_path || project.workspace_key || null;
  return null;
}
