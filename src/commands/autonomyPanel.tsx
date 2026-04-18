import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from '@anthropic/ink'
import { Dialog } from '@anthropic/ink'
import { useRegisterOverlay } from '../context/overlayContext.js'
import type { LocalJSXCommandOnDone } from '../types/command.js'
import {
  getAutonomyCommandText,
  getAutonomyDeepSectionText,
  getAutonomyStatusText,
} from '../cli/handlers/autonomy.js'
import { listAutonomyFlows, type AutonomyFlowRecord } from '../utils/autonomyFlows.js'

type AutonomyAction = {
  label: string
  description: string
  run: () => Promise<string>
}

const BASE_AUTONOMY_PANEL_ACTION_COUNT = 14

export function getAutonomyPanelBaseActionCountForTests(): number {
  return BASE_AUTONOMY_PANEL_ACTION_COUNT
}

function AutonomyPanel({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  useRegisterOverlay('autonomy-panel')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [flows, setFlows] = useState<AutonomyFlowRecord[]>([])

  useEffect(() => {
    let cancelled = false
    void listAutonomyFlows().then(items => {
      if (!cancelled) setFlows(items.slice(0, 5))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const actions = useMemo<AutonomyAction[]>(() => {
    const base: AutonomyAction[] = [
      {
        label: 'Overview',
        description: 'Runs and flows overview',
        run: () => getAutonomyStatusText(),
      },
      {
        label: 'Full deep status',
        description: 'All local autonomy health surfaces',
        run: () => getAutonomyStatusText({ deep: true }),
      },
      {
        label: 'Auto mode',
        description: 'Classifier availability and reason',
        run: () => getAutonomyDeepSectionText('auto-mode'),
      },
      {
        label: 'Runs summary',
        description: 'Autonomy run counts and latest run',
        run: () => getAutonomyDeepSectionText('runs'),
      },
      {
        label: 'Recent runs',
        description: 'Latest autonomy run records',
        run: () => getAutonomyCommandText('runs 10'),
      },
      {
        label: 'Flows summary',
        description: 'Autonomy flow counts',
        run: () => getAutonomyDeepSectionText('flows'),
      },
      {
        label: 'Recent flows',
        description: 'Latest managed autonomy flows',
        run: () => getAutonomyCommandText('flows 10'),
      },
      {
        label: 'Cron',
        description: 'Scheduled autonomy jobs',
        run: () => getAutonomyDeepSectionText('cron'),
      },
      {
        label: 'Workflow runs',
        description: 'Persisted WorkflowTool runs',
        run: () => getAutonomyDeepSectionText('workflow-runs'),
      },
      {
        label: 'Teams',
        description: 'Agent Teams and open tasks',
        run: () => getAutonomyDeepSectionText('teams'),
      },
      {
        label: 'Pipes',
        description: 'UDS/named-pipe and LAN pipe registry',
        run: () => getAutonomyDeepSectionText('pipes'),
      },
      {
        label: 'Runtime',
        description: 'Daemon and background sessions',
        run: () => getAutonomyDeepSectionText('runtime'),
      },
      {
        label: 'Remote Control',
        description: 'Bridge base URL and token presence',
        run: () => getAutonomyDeepSectionText('remote-control'),
      },
      {
        label: 'RemoteTrigger',
        description: 'Remote trigger audit state',
        run: () => getAutonomyDeepSectionText('remote-trigger'),
      },
    ]

    const flowActions = flows.flatMap<AutonomyAction>(flow => {
      const shortId = flow.flowId.slice(0, 8)
      const items: AutonomyAction[] = [
        {
          label: `Flow ${shortId}`,
          description: `${flow.status}: ${flow.goal}`,
          run: () => getAutonomyCommandText(`flow ${flow.flowId}`),
        },
      ]
      if (flow.status === 'waiting') {
        items.push({
          label: `Resume ${shortId}`,
          description: flow.currentStep
            ? `Resume waiting step: ${flow.currentStep}`
            : 'Resume waiting flow',
          run: () =>
            getAutonomyCommandText(`flow resume ${flow.flowId}`, {
              enqueueInMemory: true,
            }),
        })
      }
      if (
        flow.status === 'queued' ||
        flow.status === 'running' ||
        flow.status === 'waiting' ||
        flow.status === 'blocked'
      ) {
        items.push({
          label: `Cancel ${shortId}`,
          description: `Cancel ${flow.status} flow`,
          run: () =>
            getAutonomyCommandText(`flow cancel ${flow.flowId}`, {
              removeQueuedInMemory: true,
            }),
        })
      }
      return items
    })

    return [...base, ...flowActions]
  }, [flows])

  const selectCurrent = () => {
    const action = actions[selectedIndex]
    if (!action) return
    void action.run().then(result => {
      onDone(result, { display: 'system' })
    })
  }

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(index => Math.max(0, index - 1))
      return
    }
    if (key.downArrow) {
      setSelectedIndex(index => Math.min(actions.length - 1, index + 1))
      return
    }
    if (key.return) {
      selectCurrent()
    }
  })

  return (
    <Dialog
      title="Autonomy"
      subtitle={`${actions.length} actions`}
      onCancel={() => onDone('Autonomy panel dismissed', { display: 'system' })}
      color="background"
      hideInputGuide
    >
      <Box flexDirection="column">
        {actions.map((action, index) => (
          <Box key={`${action.label}-${index}`} flexDirection="column">
            <Text>
              {index === selectedIndex ? '› ' : '  '}
              {action.label}
            </Text>
            <Box marginLeft={4}>
              <Text dimColor>{action.description}</Text>
            </Box>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>↑/↓ select · Enter run · Esc close</Text>
        </Box>
      </Box>
    </Dialog>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: unknown,
  args?: string,
): Promise<React.ReactNode> {
  const trimmed = args?.trim() ?? ''
  if (trimmed) {
    const result = await getAutonomyCommandText(trimmed, {
      enqueueInMemory: true,
      removeQueuedInMemory: true,
    })
    onDone(result, { display: 'system' })
    return null
  }

  return <AutonomyPanel onDone={onDone} />
}
