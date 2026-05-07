/**
 * Raw Dump Git 辅助函数
 * 仅依赖 node:child_process，与框架解耦
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function gitExec(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

export async function getRepoInfo(cwd: string) {
  const [repoAddr, repoBranch, gitUserName, gitUserEmail] = await Promise.all([
    gitExec(['remote', 'get-url', 'origin'], cwd),
    gitExec(['branch', '--show-current'], cwd),
    gitExec(['config', 'user.name'], cwd),
    gitExec(['config', 'user.email'], cwd),
  ])

  return {
    repo_addr: repoAddr,
    repo_branch: repoBranch,
    git_user_name: gitUserName,
    git_user_email: gitUserEmail,
  }
}

export async function getRawDiff(cwd: string, from?: string, to?: string): Promise<string> {
  if (from && to && from !== to) {
    return gitExec(['diff', '--no-ext-diff', from, to], cwd)
  }
  // Fallback: diff working tree against HEAD
  return gitExec(['diff', 'HEAD'], cwd)
}

export async function getWorkingTreeDiff(cwd: string): Promise<string> {
  return gitExec(['diff', 'HEAD'], cwd)
}

export function countDiffLines(diff: string): number {
  let count = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) count++
  }
  if (count === 0 && diff.trim()) return diff.trim().split('\n').length
  return count
}

export function extractFilesFromDiff(diff: string): string[] {
  const files = new Set<string>()
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) files.add(line.slice(6).trim())
    else if (line.startsWith('--- a/')) files.add(line.slice(6).trim())
    else if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/)
      if (match?.[2]) files.add(match[2])
    }
  }
  return Array.from(files)
}

export function parseCommitLog(output: string): Array<{
  commit_id: string
  commit_time: string
  git_user_name: string
  git_user_email: string
  subject: string
}> {
  if (!output.trim()) return []
  return output
    .split('\n')
    .map((line) => {
      const [commit_id, commit_time, git_user_name, git_user_email, ...rest] = line.split('|')
      if (!commit_id || !git_user_email) return null
      return { commit_id, commit_time, git_user_name, git_user_email, subject: rest.join('|') }
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
}

export async function getCommitLog(cwd: string, lastCommit?: string): Promise<string> {
  const args = lastCommit
    ? ['log', `${lastCommit}..HEAD`, '--format=%H|%aI|%an|%ae|%s']
    : ['log', '--since=30 days ago', '--format=%H|%aI|%an|%ae|%s']
  return gitExec(args, cwd)
}

export async function getCommitDiff(cwd: string, commitId: string): Promise<string> {
  return gitExec(['show', '--format=', '--diff-filter=ACDMR', commitId], cwd)
}

export function toCommitComment(subject: string): string {
  return Array.from(subject).slice(0, 150).join('')
}
