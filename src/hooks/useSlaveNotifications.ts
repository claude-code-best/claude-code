/**
 * useSlaveNotifications — Real-time toast notifications for slave CLI events
 *
 * When role === 'master', watches slave session history for key events
 * and shows toast notifications in the master CLI footer.
 */

import { useEffect, useRef } from 'react'
import { useNotifications } from '../context/notifications.js'
import { useAppState } from '../state/AppState.js'
import { getPipeIpc } from '../utils/pipeTransport.js'
import type { SessionEntry } from './useMasterMonitor.js'
import type { Notification } from '../context/notifications.js'

function foldSlaveNotif(
  acc: Notification,
  _incoming: Notification,
): Notification {
  if (!('text' in acc)) return acc
  const match = acc.text.match(/\((\d+)\)$/)
  const count = match ? parseInt(match[1], 10) + 1 : 2
  const base = acc.text.replace(/\s*\(\d+\)$/, '')
  return {
    ...acc,
    text: `${base} (${count})`,
    fold: foldSlaveNotif,
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}

export function useSlaveNotifications(): void {
  const role = useAppState(s => getPipeIpc(s).role)
  const slaves = useAppState(s => getPipeIpc(s).slaves)
  const { addNotification } = useNotifications()
  const lastSeenRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (role !== 'master') return

    for (const [name, slave] of Object.entries(slaves)) {
      const lastSeen = lastSeenRef.current[name] ?? 0
      const newEntries = slave.history.slice(lastSeen)
      lastSeenRef.current[name] = slave.history.length

      for (const entry of newEntries) {
        const notification = makeNotification(name, entry)
        if (notification) {
          addNotification(notification)
        }
      }
    }

    for (const name of Object.keys(lastSeenRef.current)) {
      if (!(name in slaves)) {
        delete lastSeenRef.current[name]
      }
    }
  }, [addNotification, role, slaves])
}

function makeNotification(
  slaveName: string,
  entry: SessionEntry,
): Notification | null {
  const shortName =
    slaveName.length > 16 ? `${slaveName.slice(0, 16)}…` : slaveName

  switch (entry.type) {
    case 'prompt_ack':
      return {
        key: `slave-ack-${slaveName}`,
        text: `[${shortName}] ✓ 已接收任务`,
        priority: 'low',
        timeoutMs: 2500,
        fold: foldSlaveNotif,
      }

    case 'done':
      return {
        key: `slave-done-${slaveName}`,
        text: `[${shortName}] ✓ 任务完成`,
        priority: 'medium',
        timeoutMs: 5000,
        fold: foldSlaveNotif,
      }

    case 'error':
      return {
        key: `slave-error-${slaveName}`,
        text: `[${shortName}] ✗ 错误: ${truncate(entry.content, 60)}`,
        color: 'error',
        priority: 'high',
        timeoutMs: 8000,
      }

    case 'tool_start':
      return {
        key: `slave-tool-${slaveName}`,
        text: `[${shortName}] 工具: ${truncate(entry.content, 40)}`,
        priority: 'low',
        timeoutMs: 3000,
        fold: foldSlaveNotif,
      }

    case 'prompt':
      return {
        key: `slave-prompt-${slaveName}`,
        text: `[${shortName}] ▶ 开始处理: ${truncate(entry.content, 50)}`,
        priority: 'medium',
        timeoutMs: 4000,
      }

    case 'stream':
    case 'tool_result':
    default:
      return null
  }
}
